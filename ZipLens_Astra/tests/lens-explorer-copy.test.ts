import test from 'node:test';
import assert from 'node:assert/strict';
import type { LanguageCode } from '../src/i18n.ts';
import { lensIds } from '../src/lens-explorer-model.ts';
import { getExplorerCopy, getLensCopy, lensLearningSources } from '../src/lens-explorer-copy.ts';

const languages: LanguageCode[] = ['ko', 'en', 'ja', 'zh', 'vi', 'es', 'fr', 'de', 'ru', 'ar'];

test('every supported locale has distinct, localized copy for every lens and gallery control', () => {
    for (const language of languages) {
        const names = new Set<string>();
        for (const id of lensIds) {
            const copy = getLensCopy(language, id);
            names.add(copy.name);
            for (const value of Object.values(copy)) {
                assert.ok(value.trim().length > 0, `${language}.${id} has copy`);
                assert.doesNotMatch(value, /<[^>]*>|\{[^{}]+\}/, `${language}.${id} is display-ready plain text`);
            }
            if (language !== 'en') {
                assert.notEqual(copy.description, getLensCopy('en', id).description, `${language}.${id} is translated`);
            }
            if (language !== 'ko') {
                assert.doesNotMatch(copy.description, /[가-힣]/, `${language}.${id} does not contain Korean fallback copy`);
            }
        }
        assert.equal(names.size, lensIds.length, `${language} distinguishes all lens types`);
        const controls = getExplorerCopy(language);
        assert.deepEqual(Object.keys(controls).sort(), ['activateHint', 'nextHint', 'diagramNote', 'backToPair', 'pairTitle'].sort());
        for (const [key, value] of Object.entries(controls)) {
            assert.ok(value.trim().length > 0, `${language}.${key} has copy`);
            if (language !== 'en') {
                assert.notEqual(value, getExplorerCopy('en')[key as keyof typeof controls], `${language}.${key} is translated`);
            }
        }
    }
});

test('lens descriptions fit the compact gallery across all ten languages', () => {
    for (const language of languages) {
        const limit = language === 'ko' ? 105 : language === 'en' ? 150 : 180;
        for (const id of lensIds) {
            assert.ok([...getLensCopy(language, id).description].length <= limit, `${language}.${id} exceeds ${limit} characters`);
        }
    }
});

test('copy preserves the important optical distinctions in the Korean and English explanations', () => {
    assert.match(getLensCopy('ko', 'convex').name, /Plano-Convex/);
    assert.match(getLensCopy('ko', 'concave').name, /Bi-Concave/);
    assert.match(getLensCopy('ko', 'meniscus').name, /양의/);
    assert.match(getLensCopy('en', 'meniscus').name, /Positive/);
    assert.match(getLensCopy('en', 'achromatic').description, /two wavelengths/);
    assert.match(getLensCopy('en', 'apochromat').description, /three wavelengths/);
    assert.match(getLensCopy('en', 'apochromat').description, /three or more/);
    assert.match(getLensCopy('ko', 'apochromat').description, /세 장 이상/);
    assert.match(getLensCopy('en', 'bessel').description, /beam pattern, not a lens/);
    assert.match(getLensCopy('en', 'bessel').description, /finite range/);
    assert.match(getLensCopy('ko', 'bessel').description, /렌즈가 아닌/);
    assert.match(getLensCopy('ko', 'bessel').description, /유한한 거리/);
    assert.match(getLensCopy('en', 'telecentric').description, /chief rays/);
    assert.match(getLensCopy('en', 'telecentric').description, /working range/);
    assert.match(getLensCopy('ko', 'telecentric').description, /주광선/);
    assert.match(getLensCopy('ko', 'telecentric').description, /작동 범위/);
    for (const id of lensIds) {
        assert.doesNotMatch(getLensCopy('en', id).description, /infinite depth|always three|exactly three/i);
    }
});

test('learning references point to the primary optics documentation', () => {
    for (const reference of Object.values(lensLearningSources)) {
        const url = new URL(reference);
        assert.equal(url.protocol, 'https:');
        assert.ok(['www.thorlabs.com', 'www.edmundoptics.com'].includes(url.hostname));
    }
});
