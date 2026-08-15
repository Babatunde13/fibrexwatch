package router

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var huaweiProductName = regexp.MustCompile(`var\s+ProductName\s*=\s*'([^']+)'`)
var localAssetPath = regexp.MustCompile(`(?i)(?:src|href)=["'](/[^"'?#]+)`)
var localPageReference = regexp.MustCompile(`(?i)([a-z0-9_./-]+\.(?:asp|html|cgi))`)
var javascriptIdentifier = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]{2,}`)
var javascriptFunction = regexp.MustCompile(`(?i)function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)`)
var menuDataCall = regexp.MustCompile(`(?s)new\s+stMenuData\s*\((.*?)\)`)
var wanEthStatsCall = regexp.MustCompile(`(?s)(?:new\s+)?WanEthStats\s*\((.*?)\)`)
var wanInfoStatsCall = regexp.MustCompile(`(?s)(?:new\s+)?WaninfoStats\s*\((.*?)\)`)
var userDeviceInfoCall = regexp.MustCompile(`(?s)(?:new\s+)?stUserDevInfoPTVDF\s*\((.*?)\)`)
var lanUserDeviceCall = regexp.MustCompile(`(?s)(?:new\s+)?USERDevice\s*\((.*?)\)`)
var javascriptStringLiteral = regexp.MustCompile(`["']([^"']+)["']`)
var javascriptHexEscape = regexp.MustCompile(`\\x([0-9a-fA-F]{2})`)
var localNavigationPath = regexp.MustCompile(`(?i)(?:window\.)?location(?:\.href)?\s*=\s*["'](/[^"'?#]+)`)
var localPageName = regexp.MustCompile(`(?i)var\s+pageName\s*=\s*["'](/[^"'?#]*)`)
var loginFailureFlag = regexp.MustCompile(`LoginFailedFlag\s*=\s*['"]1['"]`)
var loginTimes = regexp.MustCompile(`LoginTimes\s*=\s*['"]([1-9][0-9]*)['"]`)
var loginUsernameField = regexp.MustCompile(`(?i)id\s*=\s*["']txt_Username["']`)
var huaweiTokenInput = regexp.MustCompile(`(?i)name\s*=\s*["']x\.X_HW_Token["'][^>]*value\s*=\s*["']([^"']+)["']`)
var huaweiTokenInputReversed = regexp.MustCompile(`(?i)value\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']x\.X_HW_Token["']`)
var huaweiTokenVariable = regexp.MustCompile(`(?i)(?:var\s+)?(?:token|hwonttoken)\s*=\s*["']([^"']+)["']`)

const huaweiWANInfoPath = "/html/bbsp/waninfo/waninfo.asp"
const huaweiWANListInfoPath = "/html/bbsp/common/wan_list_info.asp"
const huaweiUserDevicePagePath = "/html/bbsp/userdevinfo/userdevinfo1.asp"
const huaweiUserDeviceInfoPath = "/html/bbsp/userdevinfo/getuserdevinfo.asp"
const huaweiLANUserDeviceInfoPath = "/html/bbsp/common/GetLanUserDevInfo.asp"
const huaweiWLANMACFilterPagePath = "/html/bbsp/wlanmacfilter/wlanmacfilter.asp"
const huaweiWLANMACFilterSetPath = "/html/bbsp/wlanmacfilter/set.cgi?x=InternetGatewayDevice.X_HW_Security.WLANMacFilter.1&RequestFile=html/bbsp/wlanmacfilter/wlanmacfilter.asp"

var huaweiWANStatsPaths = []string{
	"/html/bbsp/common/get_wan_list_ipwanstat.asp",
	"/html/bbsp/common/get_wan_list_pppwanstat.asp",
}

var (
	ErrCredentialsRequired  = errors.New("Huawei router credentials are required")
	ErrAuthenticationFailed = errors.New("Huawei router authentication failed")
)

// HuaweiAdapter performs read-only discovery and counter collection against
// the ONT web interface.
type HuaweiAdapter struct {
	baseURL       string
	client        *http.Client
	username      string
	password      string
	authMu        sync.Mutex
	authenticated bool
	authErr       error
	landingPath   string
	landingBody   string
}

type sessionDiagnostic struct {
	responseCookies int
	jarCookies      int
	sessionCookie   bool
	sessionUpdated  bool
	responseMeta    []string
	jarNames        []string
}

func (d sessionDiagnostic) String() string {
	return fmt.Sprintf("responseCookies=%d responseMeta=%v jarCookies=%d jarNames=%v sessionCookie=%t sessionUpdated=%t",
		d.responseCookies, d.responseMeta, d.jarCookies, d.jarNames, d.sessionCookie, d.sessionUpdated)
}

func NewHuaweiAdapter(baseURL string, insecureTLS bool, username, password string) (*HuaweiAdapter, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		return nil, fmt.Errorf("router address must include http:// or https://")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: insecureTLS} //nolint:gosec
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, fmt.Errorf("create cookie jar: %w", err)
	}
	return &HuaweiAdapter{
		baseURL:  baseURL,
		client:   &http.Client{Timeout: 8 * time.Second, Transport: transport, Jar: jar},
		username: username,
		password: password,
	}, nil
}

func (h *HuaweiAdapter) HasCredentials() bool {
	return h.username != "" && h.password != ""
}

// Authenticate establishes one router session per process. It deliberately
// does not retry because the MTN firmware locks login after repeated failures.
func (h *HuaweiAdapter) Authenticate(ctx context.Context) error {
	h.authMu.Lock()
	defer h.authMu.Unlock()
	if h.authenticated {
		return nil
	}
	if h.authErr != nil {
		return h.authErr
	}
	h.authErr = h.authenticate(ctx)
	h.authenticated = h.authErr == nil
	return h.authErr
}

func (h *HuaweiAdapter) reauthenticate(ctx context.Context) error {
	h.authMu.Lock()
	defer h.authMu.Unlock()
	h.authenticated = false
	h.authErr = nil
	h.authErr = h.authenticate(ctx)
	h.authenticated = h.authErr == nil
	return h.authErr
}

func (h *HuaweiAdapter) authenticate(ctx context.Context) error {
	if !h.HasCredentials() {
		return ErrCredentialsRequired
	}
	token, err := h.fetchLoginToken(ctx)
	if err != nil {
		return err
	}
	form := url.Values{
		"UserName":     {h.username},
		"PassWord":     {base64.StdEncoding.EncodeToString([]byte(h.password))},
		"Language":     {"english"},
		"x.X_HW_Token": {token},
	}
	routerURL, err := url.Parse(h.baseURL)
	if err != nil {
		return fmt.Errorf("parse router address: %w", err)
	}
	h.client.Jar.SetCookies(routerURL, []*http.Cookie{{
		Name:  "Cookie",
		Value: "body:Language:english:id=-1",
		Path:  "/",
	}})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.baseURL+"/login.cgi", strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("create login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", h.baseURL+"/login.asp")
	req.Header.Set("Origin", h.baseURL)
	response, err := h.client.Do(req)
	if err != nil {
		return fmt.Errorf("submit router login: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("read login response: %w", err)
	}
	if response.StatusCode >= http.StatusBadRequest ||
		strings.HasSuffix(response.Request.URL.Path, "/login.asp") ||
		loginFailureFlag.Match(body) || loginTimes.Match(body) {
		return ErrAuthenticationFailed
	}
	landingPath := response.Request.URL.Path
	landingBody := string(body)
	if strings.HasSuffix(landingPath, "/login.cgi") {
		diagnostic := h.sessionDiagnostic(routerURL, response)
		match := localNavigationPath.FindStringSubmatch(landingBody)
		landingPath = "/"
		pageNameMatch := localPageName.FindStringSubmatch(landingBody)
		if len(pageNameMatch) == 2 {
			landingPath = pageNameMatch[1]
		} else if len(match) == 2 {
			if strings.HasSuffix(match[1], "/login.asp") {
				return ErrAuthenticationFailed
			}
			landingPath = match[1]
		}
		// MTN's Waiting page points to "/", while the browser ultimately opens
		// the operator-confirmed authenticated landing page at /index.asp.
		if landingPath == "/" {
			landingPath = "/index.asp"
		}
		page, err := h.fetchPage(ctx, landingPath)
		if err != nil {
			return fmt.Errorf("follow authenticated landing page (%s, responseBytes=%d): %w", diagnostic.String(), len(body), err)
		}
		landingBody = page
	}
	h.landingPath = landingPath
	h.landingBody = landingBody
	return nil
}

func (h *HuaweiAdapter) sessionDiagnostic(routerURL *url.URL, response *http.Response) sessionDiagnostic {
	diagnostic := sessionDiagnostic{responseCookies: len(response.Cookies())}
	for _, cookie := range response.Cookies() {
		diagnostic.responseMeta = append(diagnostic.responseMeta, fmt.Sprintf("%s(path=%q secure=%t maxAge=%d)", cookie.Name, cookie.Path, cookie.Secure, cookie.MaxAge))
	}
	for _, cookie := range h.client.Jar.Cookies(routerURL) {
		diagnostic.jarCookies++
		diagnostic.jarNames = append(diagnostic.jarNames, cookie.Name)
		if cookie.Name == "Cookie" {
			diagnostic.sessionCookie = true
			diagnostic.sessionUpdated = cookie.Value != "body:Language:english:id=-1"
		}
	}
	return diagnostic
}

func (h *HuaweiAdapter) fetchPage(ctx context.Context, path string) (string, error) {
	return h.requestPage(ctx, http.MethodGet, path)
}

func (h *HuaweiAdapter) requestPage(ctx context.Context, method, path string) (string, error) {
	return h.requestPageBody(ctx, method, path, "")
}

func (h *HuaweiAdapter) requestPageBody(ctx context.Context, method, path, requestBody string) (string, error) {
	return h.requestPageBodyWithReferer(ctx, method, path, requestBody, huaweiUserDevicePagePath)
}

func (h *HuaweiAdapter) requestPageBodyWithReferer(ctx context.Context, method, path, requestBody, refererPath string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, method, h.baseURL+path, strings.NewReader(requestBody))
	if err != nil {
		return "", fmt.Errorf("create page request: %w", err)
	}
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		req.Header.Set("Referer", h.baseURL+refererPath)
	}
	response, err := h.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request page: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return "", ErrAuthenticationFailed
	}
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("request page: status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read page: %w", err)
	}
	if loginFailureFlag.Match(body) || loginTimes.Match(body) || loginUsernameField.Match(body) {
		return "", ErrAuthenticationFailed
	}
	return string(body), nil
}

func splitJavaScriptArgs(input string) []string {
	args := make([]string, 0)
	start := 0
	var quote rune
	escaped := false
	for index, char := range input {
		if escaped {
			escaped = false
			continue
		}
		if char == '\\' && quote != 0 {
			escaped = true
			continue
		}
		if char == '\'' || char == '"' {
			if quote == 0 {
				quote = char
			} else if quote == char {
				quote = 0
			}
			continue
		}
		if char == ',' && quote == 0 {
			args = append(args, input[start:index])
			start = index + 1
		}
	}
	args = append(args, input[start:])
	return args
}

func parseHuaweiWANStats(document string) (download, upload uint64, err error) {
	type counterRecord struct {
		matches       [][]string
		receivedIndex int
		sentIndex     int
	}
	recordsByType := []counterRecord{
		// WanEthStats(domain, BytesReceived, PacketsReceived, BytesSent, PacketsSent)
		{matches: wanEthStatsCall.FindAllStringSubmatch(document, -1), receivedIndex: 1, sentIndex: 3},
		// WaninfoStats(domain, BytesSent, BytesReceived, ...)
		{matches: wanInfoStatsCall.FindAllStringSubmatch(document, -1), receivedIndex: 2, sentIndex: 1},
	}
	if len(recordsByType[0].matches) == 0 && len(recordsByType[1].matches) == 0 {
		return 0, 0, fmt.Errorf("Huawei WAN counter records were not found")
	}
	var parsedRecords int
	for _, recordType := range recordsByType {
		for _, match := range recordType.matches {
			if len(match) != 2 {
				continue
			}
			args := splitJavaScriptArgs(match[1])
			if len(args) <= recordType.receivedIndex || len(args) <= recordType.sentIndex {
				continue
			}
			received, parseErr := parseHuaweiCounter(args[recordType.receivedIndex])
			if parseErr != nil {
				continue
			}
			sent, parseErr := parseHuaweiCounter(args[recordType.sentIndex])
			if parseErr != nil {
				continue
			}
			if ^uint64(0)-download < received || ^uint64(0)-upload < sent {
				return 0, 0, fmt.Errorf("Huawei WAN counters overflowed")
			}
			download += received
			upload += sent
			parsedRecords++
		}
	}
	if parsedRecords == 0 {
		return 0, 0, fmt.Errorf("Huawei WAN counter records were invalid")
	}
	return download, upload, nil
}

func parseHuaweiCounter(value string) (uint64, error) {
	value = strings.Trim(strings.TrimSpace(value), `"'`)
	return strconv.ParseUint(value, 10, 64)
}

func relevantStructures(document string) []string {
	keywords := []string{"wan", "device", "client", "host", "user", "stat", "traffic", "info", "data"}
	seen := make(map[string]struct{})
	structures := make([]string, 0)
	for _, match := range javascriptFunction.FindAllStringSubmatch(document, -1) {
		if len(match) != 3 {
			continue
		}
		signature := match[1] + "(" + strings.Join(strings.Fields(match[2]), "") + ")"
		lower := strings.ToLower(signature)
		relevant := false
		for _, keyword := range keywords {
			if strings.Contains(lower, keyword) {
				relevant = true
				break
			}
		}
		if !relevant {
			continue
		}
		if _, exists := seen[signature]; exists {
			continue
		}
		seen[signature] = struct{}{}
		structures = append(structures, signature)
	}
	return structures
}

func containsPath(paths []string, wanted string) bool {
	for _, path := range paths {
		if path == wanted {
			return true
		}
	}
	return false
}

func relevantIdentifiers(document string) []string {
	keywords := []string{"byte", "packet", "receive", "received", "send", "sent", "upload", "download", "uptime", "traffic", "device", "client", "host", "mac", "address", "rate"}
	seen := make(map[string]struct{})
	fields := make([]string, 0)
	for _, identifier := range javascriptIdentifier.FindAllString(document, -1) {
		lower := strings.ToLower(identifier)
		relevant := false
		for _, keyword := range keywords {
			if strings.Contains(lower, keyword) {
				relevant = true
				break
			}
		}
		if !relevant {
			continue
		}
		if _, exists := seen[identifier]; exists {
			continue
		}
		seen[identifier] = struct{}{}
		fields = append(fields, identifier)
	}
	return fields
}

func (h *HuaweiAdapter) fetchLoginToken(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.baseURL+"/asp/GetRandCount.asp", nil)
	if err != nil {
		return "", fmt.Errorf("create login token request: %w", err)
	}
	response, err := h.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request login token: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 4096))
	if err != nil {
		return "", fmt.Errorf("read login token: %w", err)
	}
	// This firmware prefixes GetRandCount.asp with a UTF-8 BOM. Browsers remove
	// it while decoding the AJAX response, so the native client must do the same.
	token := strings.TrimSpace(strings.TrimPrefix(string(body), "\uFEFF"))
	if response.StatusCode != http.StatusOK || token == "" {
		return "", fmt.Errorf("request login token: invalid response")
	}
	return token, nil
}

func (h *HuaweiAdapter) Identity(ctx context.Context) (Identity, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.baseURL+"/", nil)
	if err != nil {
		return Identity{}, fmt.Errorf("create identity request: %w", err)
	}
	response, err := h.client.Do(req)
	if err != nil {
		return Identity{}, fmt.Errorf("request login page: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return Identity{}, fmt.Errorf("request login page: status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return Identity{}, fmt.Errorf("read login page: %w", err)
	}
	model, err := parseHuaweiProductName(string(body))
	if err != nil {
		return Identity{}, err
	}
	return Identity{Manufacturer: "Huawei", Model: model}, nil
}

func parseHuaweiProductName(page string) (string, error) {
	match := huaweiProductName.FindStringSubmatch(page)
	if len(match) != 2 {
		return "", fmt.Errorf("Huawei ProductName was not found on login page")
	}
	return strings.ReplaceAll(match[1], `\x2d`, "-"), nil
}

func (h *HuaweiAdapter) Capabilities(context.Context) (Capabilities, error) {
	return Capabilities{ConnectionCounters: true, ConnectedDevices: true, DeviceBlocking: true}, nil
}

func (h *HuaweiAdapter) BlockDevice(ctx context.Context, device DeviceBlockRequest) error {
	if err := h.Authenticate(ctx); err != nil {
		return err
	}
	if _, err := net.ParseMAC(device.MACAddress); err != nil {
		return fmt.Errorf("invalid device MAC address: %w", err)
	}
	if strings.TrimSpace(device.SSIDName) == "" {
		return fmt.Errorf("SSID name is required")
	}
	err := h.blockDevice(ctx, device)
	if !errors.Is(err, ErrAuthenticationFailed) {
		return err
	}
	if err := h.reauthenticate(ctx); err != nil {
		return fmt.Errorf("renew Huawei router session: %w", err)
	}
	return h.blockDevice(ctx, device)
}

func (h *HuaweiAdapter) blockDevice(ctx context.Context, device DeviceBlockRequest) error {
	page, err := h.fetchPage(ctx, huaweiWLANMACFilterPagePath)
	if err != nil {
		return fmt.Errorf("fetch Huawei WLAN MAC filter page: %w", err)
	}
	token, err := parseHuaweiPageToken(page)
	if err != nil {
		token, err = h.fetchLoginToken(ctx)
		if err != nil {
			return fmt.Errorf("fetch Huawei device-control token: %w", err)
		}
	}
	form := url.Values{
		"x.SourceMACAddress": {device.MACAddress},
		"x.SSIDName":         {device.SSIDName},
		"x.DeviceName":       {device.DeviceName},
		"x.Enable":           {"1"},
		"x.X_HW_Token":       {token},
	}
	if _, err := h.requestPageBodyWithReferer(ctx, http.MethodPost, huaweiWLANMACFilterSetPath, form.Encode(), huaweiWLANMACFilterPagePath); err != nil {
		return fmt.Errorf("submit Huawei WLAN MAC filter: %w", err)
	}
	return nil
}

func parseHuaweiPageToken(page string) (string, error) {
	for _, pattern := range []*regexp.Regexp{huaweiTokenInput, huaweiTokenInputReversed, huaweiTokenVariable} {
		match := pattern.FindStringSubmatch(page)
		if len(match) != 2 {
			continue
		}
		token := strings.TrimSpace(match[1])
		if token != "" && !strings.ContainsAny(token, "<>") {
			return token, nil
		}
	}
	return "", fmt.Errorf("write token was not found on MAC-filter page")
}

func (h *HuaweiAdapter) ConnectionCounters(ctx context.Context) (TrafficCounters, error) {
	if err := h.Authenticate(ctx); err != nil {
		return TrafficCounters{}, err
	}
	counters, err := h.connectionCounters(ctx)
	if !errors.Is(err, ErrAuthenticationFailed) {
		return counters, err
	}
	if err := h.reauthenticate(ctx); err != nil {
		return TrafficCounters{}, fmt.Errorf("renew Huawei router session: %w", err)
	}
	return h.connectionCounters(ctx)
}

func (h *HuaweiAdapter) connectionCounters(ctx context.Context) (TrafficCounters, error) {
	page, err := h.fetchPage(ctx, huaweiWANInfoPath)
	if err != nil {
		return TrafficCounters{}, fmt.Errorf("fetch Huawei WAN counters: %w", err)
	}
	wanList, err := h.fetchPage(ctx, huaweiWANListInfoPath)
	if err != nil {
		return TrafficCounters{}, fmt.Errorf("fetch Huawei WAN counter data: %w", err)
	}
	documents := []string{page, wanList}
	for _, statsPath := range huaweiWANStatsPaths {
		statsPage, fetchErr := h.fetchPage(ctx, statsPath)
		if fetchErr != nil {
			return TrafficCounters{}, fmt.Errorf("fetch Huawei WAN statistics (%s): %w", statsPath, fetchErr)
		}
		documents = append(documents, statsPage)
	}
	download, upload, err := parseHuaweiWANStats(strings.Join(documents, "\n"))
	if err != nil {
		return TrafficCounters{}, err
	}
	return TrafficCounters{RecordedAt: time.Now(), DownloadBytes: download, UploadBytes: upload}, nil
}

func (h *HuaweiAdapter) ConnectedDevices(ctx context.Context) ([]Device, error) {
	if err := h.Authenticate(ctx); err != nil {
		return nil, err
	}
	devices, err := h.connectedDevices(ctx)
	if !errors.Is(err, ErrAuthenticationFailed) {
		return devices, err
	}
	if err := h.reauthenticate(ctx); err != nil {
		return nil, fmt.Errorf("renew Huawei router session: %w", err)
	}
	return h.connectedDevices(ctx)
}

func (h *HuaweiAdapter) connectedDevices(ctx context.Context) ([]Device, error) {
	page, err := h.fetchPage(ctx, huaweiLANUserDeviceInfoPath)
	if err != nil {
		return nil, fmt.Errorf("fetch Huawei connected devices: %w", err)
	}
	return parseHuaweiUserDevices(page, time.Now())
}

func parseHuaweiUserDevices(document string, recordedAt time.Time) ([]Device, error) {
	type deviceRecord struct {
		matches                                                  [][]string
		hostname, ip, mac, status, realMAC, ssid, connectionType int
	}
	recordTypes := []deviceRecord{
		{userDeviceInfoCall.FindAllStringSubmatch(document, -1), 0, 2, 3, 4, 9, 5, -1},
		{lanUserDeviceCall.FindAllStringSubmatch(document, -1), 9, 1, 2, 6, 16, 3, 7},
	}
	matchCount := len(recordTypes[0].matches) + len(recordTypes[1].matches)
	if matchCount == 0 && strings.TrimSpace(document) != "" {
		trimmed := strings.TrimSpace(document)
		if len(trimmed) <= 16 {
			return nil, fmt.Errorf("Huawei connected-device response format was not recognized (response=%q)", trimmed)
		}
		return nil, fmt.Errorf("Huawei connected-device response format was not recognized (bytes=%d, structures=%v)", len(document), relevantStructures(document))
	}
	devices := make([]Device, 0, matchCount)
	seen := make(map[string]struct{})
	argCounts := make([]int, 0, matchCount)
	macLengths := make([]int, 0, matchCount)
	for _, recordType := range recordTypes {
		for _, match := range recordType.matches {
			if len(match) != 2 {
				continue
			}
			args := splitJavaScriptArgs(match[1])
			argCounts = append(argCounts, len(args))
			if len(args) <= recordType.realMAC {
				macLengths = append(macLengths, -1)
				continue
			}
			hostname := parseHuaweiString(args[recordType.hostname])
			ipAddress := parseHuaweiString(args[recordType.ip])
			ssidName := parseHuaweiString(args[recordType.ssid])
			connectionType := "Wi-Fi"
			if recordType.connectionType >= 0 && len(args) > recordType.connectionType {
				connectionType = parseHuaweiString(args[recordType.connectionType])
			}
			macAddress := parseHuaweiString(args[recordType.realMAC])
			if _, err := net.ParseMAC(macAddress); err != nil {
				macAddress = parseHuaweiString(args[recordType.mac])
			}
			macLengths = append(macLengths, len(macAddress))
			compactMAC := strings.NewReplacer(":", "", "-", "", ".", "").Replace(macAddress)
			if len(compactMAC) == 12 {
				macAddress = strings.Join([]string{compactMAC[0:2], compactMAC[2:4], compactMAC[4:6], compactMAC[6:8], compactMAC[8:10], compactMAC[10:12]}, ":")
			}
			parsedMAC, err := net.ParseMAC(macAddress)
			if err != nil || len(parsedMAC) != 6 {
				continue
			}
			macAddress = strings.ToLower(parsedMAC.String())
			if _, exists := seen[macAddress]; exists {
				continue
			}
			seen[macAddress] = struct{}{}
			if net.ParseIP(ipAddress) == nil {
				ipAddress = ""
			}
			status := strings.ToLower(parseHuaweiString(args[recordType.status]))
			online := status == "1" || status == "online" || status == "connected" || status == "up"
			devices = append(devices, Device{MACAddress: macAddress, IPAddress: ipAddress, Hostname: hostname, SSIDName: ssidName, ConnectionType: connectionType, Online: online, LastSeen: recordedAt})
		}
	}
	if matchCount > 0 && len(devices) == 0 {
		return nil, fmt.Errorf("Huawei connected-device records were invalid (matches=%d, argumentCounts=%v, macLengths=%v)", matchCount, argCounts, macLengths)
	}
	return devices, nil
}

func parseHuaweiString(value string) string {
	value = strings.Trim(strings.TrimSpace(value), `"'`)
	return javascriptHexEscape.ReplaceAllStringFunc(value, func(escape string) string {
		decoded, err := strconv.ParseUint(escape[2:], 16, 8)
		if err != nil {
			return escape
		}
		return string(rune(decoded))
	})
}

func (h *HuaweiAdapter) DeviceCounters(context.Context) ([]DeviceTrafficCounters, error) {
	return nil, ErrCapabilityUnsupported
}
