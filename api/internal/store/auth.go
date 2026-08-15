package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	Username  string
	Disabled  bool
	CreatedAt time.Time
}

type AuthenticatedUser struct {
	Username    string
	AuthVersion int64
}

func (s *Store) CreateUser(ctx context.Context, username, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if _, err := s.db.Exec(ctx, `
		insert into app_users (username,password_hash)
		values ($1,$2)`, username, string(hash)); err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return fmt.Errorf("user %q already exists", username)
		}
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.Query(ctx, `
		select
			username,
			disabled_at is not null,
			created_at
		from app_users
		order by username`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.Username, &user.Disabled, &user.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users: %w", err)
	}
	return users, nil
}

func (s *Store) DisableUser(ctx context.Context, username string) error {
	result, err := s.db.Exec(ctx, `
		update app_users
		set disabled_at=now(),
			auth_version=auth_version+1,
			updated_at=now()
		where username=$1`, username)
	if err != nil {
		return fmt.Errorf("disable user: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("user %q does not exist", username)
	}
	return nil
}

func (s *Store) ResetUserPassword(ctx context.Context, username, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	result, err := s.db.Exec(ctx, `
		update app_users
		set password_hash=$2,
			auth_version=auth_version+1,
			updated_at=now()
		where username=$1`, username, string(hash))
	if err != nil {
		return fmt.Errorf("reset user password: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("user %q does not exist", username)
	}
	return nil
}

func (s *Store) AuthenticateUser(ctx context.Context, username, password string) (AuthenticatedUser, bool, error) {
	var hash string
	var authVersion int64
	err := s.db.QueryRow(ctx, `
		select password_hash,auth_version
		from app_users
		where username=$1
			and disabled_at is null`, username).Scan(&hash, &authVersion)
	if isNoRows(err) {
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$7EqJtq98hPqEX7fNZaFWoO5E5IarK7D3lRjsIcyVbYClLTH7YYTGu"), []byte(password))
		return AuthenticatedUser{}, false, nil
	}
	if err != nil {
		return AuthenticatedUser{}, false, fmt.Errorf("load login user: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return AuthenticatedUser{}, false, nil
	}
	return AuthenticatedUser{Username: username, AuthVersion: authVersion}, true, nil
}

func (s *Store) UserAuthVersion(ctx context.Context, username string) (int64, bool, error) {
	var version int64
	err := s.db.QueryRow(ctx, `
		select auth_version
		from app_users
		where username=$1
			and disabled_at is null`, username).Scan(&version)
	if isNoRows(err) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("load user auth version: %w", err)
	}
	return version, true, nil
}
