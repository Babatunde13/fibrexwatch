package router

import (
	"context"
	"fmt"
	pathpkg "path"
	"strings"
)

// HuaweiDiscovery contains sanitized metadata about authenticated, local-only
// resources exposed by a Huawei router interface.
type HuaweiDiscovery struct {
	LandingPath  string
	AssetPaths   []string
	PagePaths    []string
	DataFields   []string
	Structures   []string
	CounterPages []HuaweiCounterPage
}

// HuaweiCounterPage describes a potential statistics page without retaining
// response values, credentials, cookies, or other sensitive router data.
type HuaweiCounterPage struct {
	Path        string
	Fields      []string
	Structures  []string
	References  []string
	InitClues   []string
	Assignments []string
}

var huaweiCounterCandidates = []string{
	"/html/bbsp/common/wan_list.asp", "/html/bbsp/common/wan_list_info.asp", "/html/bbsp/waninfo/waninfo.asp",
	"/html/bbsp/userdevinfo/userdevinfo1.asp", "/html/bbsp/userdevinfo/getuserdevinfo.asp",
	"/html/bbsp/common/lanuserinfo.asp", "/html/bbsp/common/GetLanUserDevInfo.asp",
}

// Discovery inspects only authenticated local resources and returns sanitized
// structure metadata. It never exposes response values, credentials, or cookies.
func (h *HuaweiAdapter) Discovery(ctx context.Context) (HuaweiDiscovery, error) {
	if err := h.Authenticate(ctx); err != nil {
		return HuaweiDiscovery{}, err
	}
	discovery := HuaweiDiscovery{LandingPath: h.landingPath, AssetPaths: uniqueAssetPaths(h.landingBody)}
	if containsPath(discovery.AssetPaths, "/Cusjs/frame.asp") {
		menu, err := h.fetchPage(ctx, "/Cusjs/frame.asp")
		if err != nil {
			return HuaweiDiscovery{}, fmt.Errorf("fetch Huawei menu: %w", err)
		}
		discovery.PagePaths = uniqueStrings(append(referencedLocalPages(menu, "/Cusjs/frame.asp"), extractMenuPaths(menu)...))
	}
	if containsPath(discovery.AssetPaths, "/html/bbsp/common/getWanDynamicData.asp") {
		data, err := h.fetchPage(ctx, "/html/bbsp/common/getWanDynamicData.asp")
		if err != nil {
			return HuaweiDiscovery{}, fmt.Errorf("fetch Huawei WAN data: %w", err)
		}
		document := h.landingBody + "\n" + data
		discovery.DataFields, discovery.Structures = relevantIdentifiers(document), relevantStructures(document)
	}
	for _, candidate := range huaweiCounterCandidates {
		page, err := h.fetchPage(ctx, candidate)
		if err != nil {
			continue
		}
		fields := counterIdentifiers(page)
		if len(fields) == 0 && strings.Contains(strings.ToLower(candidate), "user") {
			fields = relevantIdentifiers(page)
		}
		if len(fields) == 0 {
			continue
		}
		discovery.CounterPages = append(discovery.CounterPages, HuaweiCounterPage{Path: candidate, Fields: fields, Structures: relevantStructures(page), References: referencedLocalPages(page, candidate), Assignments: sanitizedLinesContaining(page, "waninfos")})
	}
	return discovery, nil
}

func uniqueAssetPaths(document string) []string {
	paths := make([]string, 0)
	for _, match := range localAssetPath.FindAllStringSubmatch(document, -1) {
		if len(match) == 2 {
			paths = append(paths, match[1])
		}
	}
	return uniqueStrings(paths)
}
func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
func extractMenuPaths(document string) []string {
	paths := make([]string, 0)
	for _, match := range menuDataCall.FindAllStringSubmatch(document, -1) {
		if len(match) != 2 {
			continue
		}
		args := splitJavaScriptArgs(match[1])
		if len(args) <= 5 {
			continue
		}
		value := parseHuaweiString(args[5])
		if value == "" {
			continue
		}
		if !strings.HasPrefix(value, "/") {
			value = "/" + strings.TrimPrefix(value, "./")
		}
		paths = append(paths, value)
	}
	return uniqueStrings(paths)
}
func counterIdentifiers(document string) []string {
	result := make([]string, 0)
	for _, name := range relevantIdentifiers(document) {
		lower := strings.ToLower(name)
		if strings.Contains(lower, "byte") || strings.Contains(lower, "packet") || strings.Contains(lower, "traffic") || strings.Contains(lower, "rate") {
			result = append(result, name)
		}
	}
	return result
}
func referencedLocalPages(document, basePath string) []string {
	paths := make([]string, 0)
	for _, match := range localPageReference.FindAllStringSubmatch(document, -1) {
		if len(match) != 2 {
			continue
		}
		value := match[1]
		if !strings.HasPrefix(value, "/") {
			value = pathpkg.Join(pathpkg.Dir(basePath), value)
		}
		paths = append(paths, value)
	}
	return uniqueStrings(paths)
}
func functionClues(document, functionName string) []string {
	marker := "function " + functionName
	start := strings.Index(document, marker)
	if start < 0 {
		return nil
	}
	body := document[start:]
	if next := strings.Index(body[1:], "function "); next >= 0 {
		body = body[:next+1]
	}
	clues := referencedLocalPages(body, "/")
	clues = append(clues, functionName)
	for _, identifier := range relevantIdentifiers(body) {
		if identifier != functionName {
			clues = append(clues, identifier)
		}
	}
	return uniqueStrings(clues)
}
func sanitizedLinesContaining(document, needle string) []string {
	lines := make([]string, 0)
	for _, line := range strings.Split(document, "\n") {
		if !strings.Contains(line, needle) {
			continue
		}
		line = javascriptStringLiteral.ReplaceAllString(line, `"<value>"`)
		line = strings.TrimSpace(line)
		if len(line) > 500 {
			line = line[:500]
		}
		lines = append(lines, line)
	}
	return uniqueStrings(lines)
}
