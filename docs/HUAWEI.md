# Huawei ONT integration

This document describes FibreXWatch's Huawei web adapter for the MTN-supplied OptiXstar HG8145X7-10/HO8145X7-10 ONT. MTN firmware variants can expose different pages and fields, so support is limited to behavior confirmed on the local device.

## Network requirement

The worker must run on a machine that can reach the ONT's private management address. Hosting the API or web dashboard elsewhere does not give a remote worker access to `192.168.100.1`; keep the worker on the home network or connect it through a private VPN.

The confirmed management URL is:

```text
https://192.168.100.1:80
```

Although port 80 normally carries HTTP, this ONT is configured to serve HTTPS there. Preserve both the scheme and port.

## Configuration

Put router credentials only in the gitignored repository-root `.env`:

```env
ROUTER_ADDRESS=https://192.168.100.1:80
ROUTER_ADAPTER=huawei-web
ROUTER_INSECURE_TLS=true
ROUTER_USERNAME=your_router_username
ROUTER_PASSWORD=your_router_password
ROUTER_DISCOVERY=false
ROUTER_SSID_NAME=SSID-1
ROUTER_24GHZ_SSIDS=SSID-1,SSID1
ROUTER_5GHZ_SSIDS=SSID-5,SSID5
COLLECTION_INTERVAL=60s
```

`ROUTER_INSECURE_TLS=true` is required for the ONT's self-signed local certificate. Do not use that setting for public internet services.

Start a single worker with either:

```sh
make worker
```

or:

```sh
make worker-background
make worker-status
```

Do not run both forms simultaneously. Check for duplicate processes with:

```sh
pgrep -fl 'fibrex-worker|cmd/worker'
```

## Authentication behavior

The adapter requests a Huawei token, submits the username and base64-encoded password to `login.cgi`, and retains the returned cookies in an in-memory cookie jar. Base64 is part of the router protocol and is not password encryption; HTTPS protects the request on the LAN.

Authentication is deliberately limited to one initial attempt per worker process because repeated failures can trigger the MTN firmware's login lockout. The adapter performs one controlled reauthentication when an established session expires.

Credentials, cookies, tokens, and router response values are not returned through the API or written to discovery logs.

## Supported capabilities

The adapter currently supports:

- cumulative WAN download and upload counters;
- connected-device snapshots;
- MAC address, IP address, hostname, online state, SSID, and connection type where supplied;
- 2.4 GHz and 5 GHz classification from configured SSID aliases;
- WLAN MAC-filter blocking requested through the dashboard.

FibreXWatch calculates router-wide usage from the difference between consecutive cumulative WAN readings. A lower counter is treated as a reset, such as after an ONT restart.

The confirmed read paths include:

```text
/html/bbsp/waninfo/waninfo.asp
/html/bbsp/common/wan_list_info.asp
/html/bbsp/common/get_wan_list_ipwanstat.asp
/html/bbsp/common/get_wan_list_pppwanstat.asp
/html/bbsp/common/GetLanUserDevInfo.asp
```

Device blocking uses Huawei's WLAN MAC-filter page and `set.cgi`. This is a router mutation, unlike normal collection, and only runs after a user explicitly requests blocking.

## Known limitation: per-device usage

This firmware does not expose persistent cumulative byte counters for individual clients through the confirmed pages. Consequently, FibreXWatch does not calculate, estimate, rank, or budget data usage per device. It can still report device presence, approximate online duration, reconnect sessions, known IPs, and the current connection band.

Router-wide WAN totals remain accurate because they come from the ONT's cumulative WAN counters.

## Safe discovery

Set the following temporarily to inspect sanitized page structure:

```env
ROUTER_DISCOVERY=true
```

Then run one collection:

```sh
make worker-once
```

Discovery checks a fixed list of authenticated local pages and logs field names, JavaScript structure names, and page references. It does not log field values, credentials, cookies, or tokens. Set `ROUTER_DISCOVERY=false` again after troubleshooting.

## Troubleshooting

### HTTP 403

A 403 usually means the session expired, the credentials lack access to a page, another administrator session displaced the worker, or the firmware variant uses a different endpoint. Stop duplicate workers, sign out of the router UI, and restart one worker. Avoid repeated login attempts if the credentials may be wrong.

### No new readings

Check the managed worker and its log:

```sh
make worker-status
tail -f api/logs/fibrexwatch-worker.log
```

Also confirm the worker host can open `https://192.168.100.1:80`, PostgreSQL is running, and the root `.env` contains the correct address and adapter.

### Device count looks wrong

The count reflects devices present in the ONT snapshot, not every historical device. Confirm `ROUTER_24GHZ_SSIDS` and `ROUTER_5GHZ_SSIDS` match the router's actual SSID labels, and ensure only one worker is collecting.

### Device blocking fails

Blocking applies to WLAN clients through the MAC-filter interface. Ethernet devices are not controlled by that WLAN endpoint. The router account must have permission to edit WLAN MAC filters, and the SSID configured for the device must match a router SSID.
