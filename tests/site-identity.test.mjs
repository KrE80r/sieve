import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const mark = readFileSync(new URL('../assets/sieve-mark.svg', import.meta.url), 'utf8');
const favicon = readFileSync(new URL('../assets/sieve-favicon.svg', import.meta.url), 'utf8');

test('uses the Terminus identity across favicon and visible brands', () => {
    assert.match(index, /rel="icon"[^>]+href="assets\/sieve-favicon\.svg"/);
    assert.equal((index.match(/src="assets\/sieve-mark\.svg\?v=terminus-1"/g) || []).length, 2);
    assert.match(index, /rel="apple-touch-icon" href="assets\/sieve-touch-icon\.png\?v=terminus-1"/);
    assert.doesNotMatch(index, />▽</);

    assert.equal((mark.match(/<rect /g) || []).length, 4);
    assert.doesNotMatch(mark, /fill="#0B0C0D"/);
    assert.equal((mark.match(/fill="#74B6DC"/g) || []).length, 1);
    assert.match(mark, /x="17" y="74" width="66" height="10" rx="5"/);

    assert.equal((favicon.match(/<rect /g) || []).length, 5);
    assert.match(favicon, /fill="#0B0C0D"/);
    assert.equal((favicon.match(/fill="#74B6DC"/g) || []).length, 1);
    assert.match(styles, /\.logo-icon,\s*\.mobile-brand-icon\s*\{/);
});
