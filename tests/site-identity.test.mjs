import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const mark = readFileSync(new URL('../assets/sieve-mark.svg', import.meta.url), 'utf8');

test('uses one Retained Grain identity across favicon and visible brands', () => {
    assert.match(index, /rel="icon"[^>]+href="assets\/sieve-mark\.svg"/);
    assert.equal((index.match(/src="assets\/sieve-mark\.svg"/g) || []).length, 2);
    assert.doesNotMatch(index, />▽</);

    assert.equal((mark.match(/<circle /g) || []).length, 9);
    assert.equal((mark.match(/fill="#74B6DC"/g) || []).length, 1);
    assert.match(styles, /\.logo-icon,\s*\.mobile-brand-icon\s*\{/);
});
