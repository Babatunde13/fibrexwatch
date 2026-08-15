package router

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestParseHuaweiProductName(t *testing.T) {
	got, err := parseHuaweiProductName(`<script>var ProductName = 'HG8145X7\x2d10';</script>`)
	if err != nil {
		t.Fatal(err)
	}
	if got != "HG8145X7-10" {
		t.Fatalf("model = %q, want HG8145X7-10", got)
	}
}

func TestHuaweiAuthenticate(t *testing.T) {
	var loginCalls int
	adapter, err := NewHuaweiAdapter("http://router.test", false, "admin", "secret")
	if err != nil {
		t.Fatal(err)
	}
	adapter.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := ""
		switch r.URL.Path {
		case "/asp/GetRandCount.asp":
			body = "test-token"
		case "/login.cgi":
			loginCalls++
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			if got := r.Form.Get("UserName"); got != "admin" {
				t.Errorf("username = %q", got)
			}
			if got := r.Form.Get("PassWord"); got != base64.StdEncoding.EncodeToString([]byte("secret")) {
				t.Errorf("encoded password = %q", got)
			}
			if got := r.Form.Get("x.X_HW_Token"); got != "test-token" {
				t.Errorf("token = %q", got)
			}
			body = ""
		case "/index.asp":
			cookie, err := r.Cookie("Cookie")
			if err != nil || cookie.Value != "body:Language:english:id=-1" {
				t.Errorf("language/session cookie was not retained: cookie=%v error=%v", cookie, err)
			}
			body = `<script src="/js/main.js"></script>`
		default:
			return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("not found")), Request: r}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})
	if err := adapter.Authenticate(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := adapter.Authenticate(context.Background()); err != nil {
		t.Fatal(err)
	}
	if loginCalls != 1 {
		t.Fatalf("login calls = %d, want 1", loginCalls)
	}
	if adapter.landingPath != "/index.asp" {
		t.Fatalf("landing path = %q", adapter.landingPath)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestHuaweiAuthenticateRequiresCredentials(t *testing.T) {
	adapter, err := NewHuaweiAdapter("http://192.0.2.1", false, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := adapter.Authenticate(context.Background()); err != ErrCredentialsRequired {
		t.Fatalf("error = %v, want ErrCredentialsRequired", err)
	}
}

func TestHuaweiBlockDevice(t *testing.T) {
	adapter, err := NewHuaweiAdapter("http://router.test", false, "admin", "secret")
	if err != nil {
		t.Fatal(err)
	}
	adapter.authenticated = true
	adapter.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := ""
		switch r.URL.Path {
		case huaweiWLANMACFilterPagePath:
			body = `<input type="hidden" name="x.X_HW_Token" value="control-token">`
		case "/html/bbsp/wlanmacfilter/set.cgi":
			if err := r.ParseForm(); err != nil {
				t.Fatal(err)
			}
			want := map[string]string{
				"x.SourceMACAddress": "2e:5b:26:bb:fc:8a",
				"x.SSIDName":         "SSID-1",
				"x.DeviceName":       "Pixel-9-Pro",
				"x.Enable":           "1",
				"x.X_HW_Token":       "control-token",
			}
			for field, value := range want {
				if got := r.Form.Get(field); got != value {
					t.Errorf("%s = %q, want %q", field, got, value)
				}
			}
			if got := r.Header.Get("Referer"); got != "http://router.test"+huaweiWLANMACFilterPagePath {
				t.Errorf("referer = %q", got)
			}
		default:
			return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("not found")), Request: r}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})

	err = adapter.BlockDevice(context.Background(), DeviceBlockRequest{
		MACAddress: "2e:5b:26:bb:fc:8a",
		SSIDName:   "SSID-1",
		DeviceName: "Pixel-9-Pro",
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestParseHuaweiPageTokenVariable(t *testing.T) {
	token, err := parseHuaweiPageToken(`var token = 'settings-token';`)
	if err != nil {
		t.Fatal(err)
	}
	if token != "settings-token" {
		t.Fatalf("token = %q", token)
	}
}

func TestHuaweiConnectionCountersRenewsExpiredSession(t *testing.T) {
	adapter, err := NewHuaweiAdapter("http://router.test", false, "admin", "secret")
	if err != nil {
		t.Fatal(err)
	}
	adapter.authenticated = true
	var loginCalls, wanPageCalls int
	adapter.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		status := http.StatusOK
		body := ""
		switch r.URL.Path {
		case huaweiWANInfoPath:
			wanPageCalls++
			if wanPageCalls == 1 {
				status = http.StatusForbidden
			}
		case "/asp/GetRandCount.asp":
			body = "renew-token"
		case "/login.cgi":
			loginCalls++
		case "/index.asp", huaweiWANListInfoPath:
		case huaweiWANStatsPaths[0]:
			body = `new WaninfoStats("wan.1", "250", "1000", "4", "10")`
		case huaweiWANStatsPaths[1]:
		default:
			status = http.StatusNotFound
		}
		return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})

	counters, err := adapter.ConnectionCounters(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if loginCalls != 1 || wanPageCalls != 2 {
		t.Fatalf("login calls=%d WAN page calls=%d, want 1 and 2", loginCalls, wanPageCalls)
	}
	if counters.DownloadBytes != 1000 || counters.UploadBytes != 250 {
		t.Fatalf("unexpected counters: %#v", counters)
	}
}

func TestHuaweiDiscoveryReturnsOnlyUniqueLocalPaths(t *testing.T) {
	adapter, err := NewHuaweiAdapter("http://router.test", false, "admin", "secret")
	if err != nil {
		t.Fatal(err)
	}
	adapter.authenticated = true
	adapter.landingPath = "/index.asp"
	adapter.landingBody = `<script src="/js/main.js?token=secret"></script><a href="/status/device.asp">Status</a><script src="/js/main.js"></script>`
	adapter.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := `var pages = ["html/status/wan.asp", "/html/status/wan.asp", "/html/status/devices.html"];`
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})
	discovery, err := adapter.Discovery(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if discovery.LandingPath != "/index.asp" {
		t.Fatalf("landing path = %q", discovery.LandingPath)
	}
	if len(discovery.AssetPaths) != 2 || discovery.AssetPaths[0] != "/js/main.js" || discovery.AssetPaths[1] != "/status/device.asp" {
		t.Fatalf("asset paths = %#v", discovery.AssetPaths)
	}
	if len(discovery.PagePaths) != 0 {
		t.Fatalf("unexpected page paths = %#v", discovery.PagePaths)
	}
}

func TestHuaweiDiscoveryExtractsMenuPages(t *testing.T) {
	adapter, err := NewHuaweiAdapter("http://router.test", false, "admin", "secret")
	if err != nil {
		t.Fatal(err)
	}
	adapter.authenticated = true
	adapter.landingPath = "/index.asp"
	adapter.landingBody = `<script src="/Cusjs/frame.asp"></script>`
	adapter.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := `var pages = ["/html/status/wan.asp", "/html/status/wan.asp", "/html/status/devices.html"];`
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})
	discovery, err := adapter.Discovery(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(discovery.PagePaths) != 2 || discovery.PagePaths[0] != "/html/status/wan.asp" || discovery.PagePaths[1] != "/html/status/devices.html" {
		t.Fatalf("page paths = %#v", discovery.PagePaths)
	}
}

func TestFetchLoginTokenStripsUTF8BOM(t *testing.T) {
	adapter, err := NewHuaweiAdapter("http://router.test", false, "admin", "secret")
	if err != nil {
		t.Fatal(err)
	}
	adapter.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader("\uFEFFabc123\n")),
			Request:    r,
		}, nil
	})
	token, err := adapter.fetchLoginToken(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if token != "abc123" {
		t.Fatalf("token = %q, want abc123", token)
	}
}

func TestHuaweiLoginFollowsIndirectPageName(t *testing.T) {
	if match := localPageName.FindStringSubmatch(`<script>var pageName = '/html/amp/common/mainframe.asp'; top.location.replace(pageName);</script>`); len(match) != 2 || match[1] != "/html/amp/common/mainframe.asp" {
		t.Fatalf("page name match = %#v", match)
	}
}

func TestRelevantIdentifiersDoesNotReturnValues(t *testing.T) {
	fields := relevantIdentifiers(`var BytesReceived = "123456"; var MACAddress = "aa:bb:cc:dd:ee:ff"; var Password = "secret";`)
	if len(fields) != 2 || fields[0] != "BytesReceived" || fields[1] != "MACAddress" {
		t.Fatalf("fields = %#v", fields)
	}
}

func TestRelevantStructuresReturnsSignaturesOnly(t *testing.T) {
	structures := relevantStructures(`function DeviceInfo(mac, ip, password) { this.mac = mac; } function IgnoreMe(foo) {}`)
	if len(structures) != 1 || structures[0] != "DeviceInfo(mac,ip,password)" {
		t.Fatalf("structures = %#v", structures)
	}
}

func TestExtractMenuPaths(t *testing.T) {
	document := `var item = new stMenuData(1, "status", 2, "off.png", "on.png", "html/status/userdevinfo.asp", 0);`
	paths := extractMenuPaths(document)
	if len(paths) != 1 || paths[0] != "/html/status/userdevinfo.asp" {
		t.Fatalf("paths = %#v", paths)
	}
}

func TestCounterIdentifiersReturnsNamesOnly(t *testing.T) {
	fields := counterIdentifiers(`var BytesReceived = "100"; var txPackets = "2"; var Password = "secret";`)
	if len(fields) != 2 || fields[0] != "BytesReceived" || fields[1] != "txPackets" {
		t.Fatalf("fields = %#v", fields)
	}
}

func TestParseHuaweiWANStats(t *testing.T) {
	document := `
		var stats = new Array(
			new WanEthStats("wan.1", "1000", "10", "250", "4"),
			WanEthStats("wan.2", "3000", "20", "750", "8")
		);`
	download, upload, err := parseHuaweiWANStats(document)
	if err != nil {
		t.Fatal(err)
	}
	if download != 4000 || upload != 1000 {
		t.Fatalf("download=%d upload=%d", download, upload)
	}
}

func TestParseHuaweiWANInfoStats(t *testing.T) {
	document := `
		function WaninfoStats(domain, BytesSent, BytesReceived) {}
		new WaninfoStats("wan.1", "250", "1000", "4", "10"),
		new WaninfoStats("wan.2", "750", "3000", "8", "20")
	`
	download, upload, err := parseHuaweiWANStats(document)
	if err != nil {
		t.Fatal(err)
	}
	if download != 4000 || upload != 1000 {
		t.Fatalf("unexpected counters: download=%d upload=%d", download, upload)
	}
}

func TestParseHuaweiWANStatsRejectsMissingRecords(t *testing.T) {
	if _, _, err := parseHuaweiWANStats("var empty = true;"); err == nil {
		t.Fatal("expected missing counter error")
	}
}

func TestParseHuaweiUserDevices(t *testing.T) {
	recordedAt := time.Date(2026, time.August, 15, 12, 0, 0, 0, time.UTC)
	document := `new stUserDevInfoPTVDF("phone", "mobile", "192.168.100.20", "AA-BB-CC-DD-EE-FF", "Online", "SSID1", "", "", "domain", "", "0", "0", "", "")`
	devices, err := parseHuaweiUserDevices(document, recordedAt)
	if err != nil {
		t.Fatal(err)
	}
	if len(devices) != 1 {
		t.Fatalf("devices = %#v", devices)
	}
	device := devices[0]
	if device.Hostname != "phone" || device.IPAddress != "192.168.100.20" || device.MACAddress != "aa:bb:cc:dd:ee:ff" || device.SSIDName != "SSID1" || device.ConnectionType != "Wi-Fi" || !device.Online || !device.LastSeen.Equal(recordedAt) {
		t.Fatalf("unexpected device: %#v", device)
	}
}

func TestParseHuaweiLANUserDevices(t *testing.T) {
	recordedAt := time.Date(2026, time.August, 15, 12, 0, 0, 0, time.UTC)
	document := `new USERDevice("domain", "192.168.100.21", "11:22:33:44:55:66", "SSID1", "IPv4", "phone", "1", "wifi", "", "tablet", "1", "0", "", "", "", "", "", "", "", "", "")`
	devices, err := parseHuaweiUserDevices(document, recordedAt)
	if err != nil {
		t.Fatal(err)
	}
	if len(devices) != 1 || devices[0].Hostname != "tablet" || devices[0].MACAddress != "11:22:33:44:55:66" || devices[0].SSIDName != "SSID1" || devices[0].ConnectionType != "wifi" || !devices[0].Online {
		t.Fatalf("unexpected devices: %#v", devices)
	}
}

func TestParseHuaweiLANUserDevicesWithHexEscapes(t *testing.T) {
	recordedAt := time.Date(2026, time.August, 15, 12, 0, 0, 0, time.UTC)
	document := `var UserDevinfo = new Array(new USERDevice("domain", "192\x2e168\x2e100\x2e21", "11\x3a22\x3a33\x3a44\x3a55\x3a66", "SSID1", "DHCP", "android", "Online", "WIFI", "", "Pixel\x2d9", "1", "1", "", "", "", "", "", "", "", "", "229"));`
	devices, err := parseHuaweiUserDevices(document, recordedAt)
	if err != nil {
		t.Fatal(err)
	}
	if len(devices) != 1 || devices[0].Hostname != "Pixel-9" || devices[0].IPAddress != "192.168.100.21" || devices[0].MACAddress != "11:22:33:44:55:66" || !devices[0].Online {
		t.Fatalf("unexpected devices: %#v", devices)
	}
}

func TestReferencedLocalPages(t *testing.T) {
	paths := referencedLocalPages(`$.get("getWanStats.asp"); load("../../common/data.asp");`, "/html/bbsp/waninfo/waninfo.asp")
	if len(paths) != 2 || paths[0] != "/html/bbsp/waninfo/getWanStats.asp" || paths[1] != "/html/common/data.asp" {
		t.Fatalf("paths = %#v", paths)
	}
}

func TestFunctionClues(t *testing.T) {
	clues := functionClues(`function InitWanStatsData() { $.ajax({ url: "/stats.asp", data: WanDomain }); }`, "InitWanStatsData")
	if len(clues) < 2 || clues[0] != "/stats.asp" {
		t.Fatalf("clues = %#v", clues)
	}
}

func TestSanitizedLinesContaining(t *testing.T) {
	lines := sanitizedLinesContaining(`var waninfos = GetStats("secret-domain");`, "waninfos")
	if len(lines) != 1 || lines[0] != `var waninfos = GetStats("<value>");` {
		t.Fatalf("lines = %#v", lines)
	}
}

func TestParseHuaweiProductNameRejectsUnknownPage(t *testing.T) {
	if _, err := parseHuaweiProductName(`<html></html>`); err == nil {
		t.Fatal("expected missing product name error")
	}
}
