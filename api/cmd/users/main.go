package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/local/mtn-fibrex/api/internal/config"
	"github.com/local/mtn-fibrex/api/internal/store"
	"golang.org/x/term"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db, err := store.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	switch os.Args[1] {
	case "create":
		runCreate(db, os.Args[2:])
	case "list":
		runList(db)
	case "disable":
		runDisable(db, os.Args[2:])
	case "reset-password":
		runResetPassword(db, os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}
}

func runCreate(db *store.Store, args []string) {
	flags := flag.NewFlagSet("create", flag.ExitOnError)
	usernameFlag := flags.String("username", "", "username for the new account")
	_ = flags.Parse(args)
	username := readUsername(*usernameFlag)
	password := readPassword("Password: ")
	confirmation := readPassword("Confirm password: ")
	if password != confirmation {
		log.Fatal("passwords do not match")
	}
	if len(password) < 8 {
		log.Fatal("password must contain at least 8 characters")
	}
	if err := db.CreateUser(context.Background(), username, password); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Created user %q.\n", username)
}

func runList(db *store.Store) {
	users, err := db.ListUsers(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	if len(users) == 0 {
		fmt.Println("No users found.")
		return
	}
	for _, user := range users {
		status := "active"
		if user.Disabled {
			status = "disabled"
		}
		fmt.Printf("%s\t%s\tcreated %s\n", user.Username, status, user.CreatedAt.Format("2006-01-02 15:04:05 MST"))
	}
}

func runDisable(db *store.Store, args []string) {
	flags := flag.NewFlagSet("disable", flag.ExitOnError)
	usernameFlag := flags.String("username", "", "username to disable")
	_ = flags.Parse(args)
	username := readUsername(*usernameFlag)
	if err := db.DisableUser(context.Background(), username); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Disabled user %q.\n", username)
}

func runResetPassword(db *store.Store, args []string) {
	flags := flag.NewFlagSet("reset-password", flag.ExitOnError)
	usernameFlag := flags.String("username", "", "username whose password should be reset")
	_ = flags.Parse(args)
	username := readUsername(*usernameFlag)
	if username == "" {
		log.Fatal("username is required")
	}
	password := readPassword("New password: ")
	confirmation := readPassword("Confirm new password: ")
	if password != confirmation {
		log.Fatal("passwords do not match")
	}
	if len(password) < 8 {
		log.Fatal("password must contain at least 8 characters")
	}
	if err := db.ResetUserPassword(context.Background(), username, password); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Reset password for user %q.\n", username)
}

func readPassword(prompt string) string {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		log.Fatal("password entry requires an interactive terminal")
	}
	fmt.Print(prompt)
	value, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		log.Fatal(err)
	}
	return string(value)
}

func readUsername(value string) string {
	username := strings.TrimSpace(value)
	if username != "" {
		return username
	}
	fmt.Print("Username: ")
	username, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		log.Fatal(err)
	}
	username = strings.TrimSpace(username)
	if username == "" {
		log.Fatal("username cannot be empty")
	}
	return username
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: users <create|list|disable|reset-password> [options]")
}
