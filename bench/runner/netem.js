/**
 * Packet-level network shaping with Linux's tc and netem, to check that the
 * DevTools Protocol's per-request throttling leads to the same conclusions.
 *
 * Only the traffic to and from the proxy's ports is shaped, each direction at
 * its own rate, with half the round trip added each way; the proxy's traffic
 * to the stacks' servers stays as fast as the machine. Loopback's MTU is set
 * to Ethernet's 1500 bytes, so TCP sends packets of a real network's size and
 * its slow start and the TLS handshake cost what they would. The numbers are
 * the profile's own (Lighthouse's), without the adjustments DevTools
 * throttling needs. Linux and sudo only; GitHub's runners have both.
 */
import { execFileSync } from 'node:child_process';

const run = (command, args) => execFileSync('sudo', [command, ...args], { stdio: 'pipe' });

/** Loopback's MTU before shape() changed it. */
let mtu = null;

/**
 * @param {number[]} ports the proxy's listening ports
 * @param {{ rttMs: number, downloadKbps: number, uploadKbps: number }} network kbps of 1024 bits, as Lighthouse counts
 */
export function shape(ports, { rttMs, downloadKbps, uploadKbps }) {
    if (process.platform !== 'linux') throw new Error('Shaping the network with netem needs Linux (tc) and sudo.');
    unshape();
    mtu ??= Number(execFileSync('cat', ['/sys/class/net/lo/mtu'], { encoding: 'utf8' }).trim());
    run('ip', ['link', 'set', 'dev', 'lo', 'mtu', '1500']);
    const delay = `${rttMs / 2}ms`;
    const rate = (kbps) => `${Math.round(kbps * 1024)}bit`;
    // Three bands: 1:1 to the browser, 1:2 from it, and 1:3, unshaped, for everything else.
    run('tc', ['qdisc', 'add', 'dev', 'lo', 'root', 'handle', '1:', 'prio', 'bands', '3', 'priomap', ...Array(16).fill('2')]);
    run('tc', ['qdisc', 'add', 'dev', 'lo', 'parent', '1:1', 'handle', '10:', 'netem', 'delay', delay, 'rate', rate(downloadKbps), 'limit', '100000']);
    run('tc', ['qdisc', 'add', 'dev', 'lo', 'parent', '1:2', 'handle', '20:', 'netem', 'delay', delay, 'rate', rate(uploadKbps), 'limit', '100000']);
    for (const port of ports) {
        run('tc', ['filter', 'add', 'dev', 'lo', 'parent', '1:', 'protocol', 'ip', 'prio', '1', 'u32', 'match', 'ip', 'sport', String(port), '0xffff', 'flowid', '1:1']);
        run('tc', ['filter', 'add', 'dev', 'lo', 'parent', '1:', 'protocol', 'ip', 'prio', '2', 'u32', 'match', 'ip', 'dport', String(port), '0xffff', 'flowid', '1:2']);
    }
}

/** Removes the shaping and restores loopback's MTU. */
export function unshape() {
    if (process.platform !== 'linux') return;
    try {
        run('tc', ['qdisc', 'del', 'dev', 'lo', 'root']);
    } catch {
        // Nothing was shaped.
    }
    if (mtu) run('ip', ['link', 'set', 'dev', 'lo', 'mtu', String(mtu)]);
}
