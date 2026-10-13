import { describe, expect, it } from 'vitest';
import { imageFileIds, RichText } from './content.js';

const fileId = '01a13585-3c93-7032-a23b-35f1b8ee860a';

describe('RichText (lesson text)', () => {
  it('keeps headings, bold, lists, links, and group images', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Variables' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Read ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'the docs', marks: [{ type: 'link', attrs: { href: 'https://docs.python.org' } }] },
          ],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
        { type: 'image', attrs: { src: `/api/v1/files/${fileId}`, alt: 'diagram' } },
      ],
    };
    expect(RichText.parse(doc)).toEqual(doc);
    expect(imageFileIds(RichText.parse(doc))).toEqual([fileId]);
  });

  it('drops attributes it does not know', () => {
    const parsed = RichText.parse({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { style: 'x' }, content: [{ type: 'text', text: 'hi', onclick: 'evil()' }] }],
    });
    expect(parsed).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] });
  });

  it.each([
    ['a javascript: link', { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
    ['an image from elsewhere', { type: 'image', attrs: { src: 'https://evil.example/track.png' } }],
    ['an unknown node', { type: 'iframe', attrs: { src: 'https://evil.example' } }],
    ['raw HTML', { type: 'html', content: '<script>alert(1)</script>' }],
    ['a level-1 heading', { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'x' }] }],
  ])('refuses %s', (_name, block) => {
    expect(RichText.safeParse({ type: 'doc', content: [block] }).success).toBe(false);
  });
});
