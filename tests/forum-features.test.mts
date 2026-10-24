import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "../components/RichText";
import { contentReferences, internalTarget } from "../lib/forum-syntax";
import { insertQuoteBlock } from "../lib/editor";
const render = (content: string) =>
  renderToStaticMarkup(
    createElement(RichText, {
      content,
      emojis: [{ name: "school", image_path: "/uploads/emoji-test.png" }],
    }),
  );
test("custom emoji uses the shared renderer and leaves code, math, URLs and unknown names unchanged", () => {
  const html = render(
    ":school: :unknown: `:school:`\n\n```\n:school:\n```\n\n$x_{:school:}$\n\n[:school:](https://example.org/:school:)",
  );
  assert.equal((html.match(/class="custom-emoji"/g) || []).length, 1);
  assert.match(html, /:unknown:/);
  assert.match(html, /<code>:school:<\/code>/);
});
test("BBCode wrappers and block quote envelopes render controlled elements", () => {
  const html = render(
    '[b]bold[/b] [u]line[/u] [spoiler]secret[/spoiler]\n\n[quote thread=12 reply=34]\n\n**selected**\n\n[/quote]\n\n[details="More"]\n\nbody\n\n[/details]',
  );
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<u>line<\/u>/);
  assert.match(html, /class="post-quote"/);
  assert.match(html, /selected/);
  assert.doesNotMatch(html, /#34|引用来源/);
  assert.match(html, /<details>/);
  assert.match(html, /<summary>More<\/summary>/);
});
test("reference extraction ignores code and external hosts", () => {
  assert.equal(internalTarget("https://evil.example/t/1"), null);
  assert.deepEqual(
    contentReferences(
      "[quote thread=12 reply=34]\n\ntext\n\n[/quote]\n\n`[quote thread=99 reply=1]`\n\n[topic](/t/5)",
    ),
    [
      { thread: 12, reply: 34, kind: "quote" },
      { thread: 5, reply: 0, kind: "link" },
    ],
  );
});

test("BBCode supports nested tags across Markdown nodes and keeps incomplete input literal", () => {
  const html = render("[b]bold **markdown** [i]nested[/i][/b] [b]unfinished");
  assert.match(
    html,
    /<strong>bold <strong>markdown<\/strong> <em>nested<\/em><\/strong>/,
  );
  assert.match(html, /\[b\]unfinished/);
});

test("block closing tags work next to images and with multipart CRLF input", () => {
  const html = render(
    '[details="更多"]\r\n\r\ntext\r\n\r\n[/details]\r\n![image](/image.png)',
  );
  assert.match(html, /<details>/);
  assert.match(html, /<summary>更多<\/summary>/);
});

test('escaped BBCode/emoji stay literal and standalone relative links produce references',()=>{
 const html=render('\\[b]literal[/b] \\:school:');assert.doesNotMatch(html,/<strong>|custom-emoji/);
 assert.deepEqual(contentReferences('/t/12#reply-34'),[{thread:12,reply:34,kind:'link'}]);
});

test('standard emoji shortcodes render in prose while custom names retain precedence',()=>{
 assert.match(render('Hello :smile: :heart:'),/Hello <span class="native-emoji"[^>]*>😄<\/span> <span class="native-emoji"[^>]*>❤️<\/span>/);
 assert.match(render('`:smile:`'),/<code>:smile:<\/code>/);
 const html=renderToStaticMarkup(createElement(RichText,{content:':smile:',emojis:[{name:'smile',image_path:'/uploads/custom.png'}]}));
 assert.match(html,/src="\/uploads\/custom.png"/);
});

test('insertQuoteBlock pads plain quote blocks and parks the caret after them',()=>{
 const mid=insertQuoteBlock({value:'before\nafter',start:7,end:7});
 assert.equal(mid.value,'before\n[quote]\n引用内容\n[/quote]\n\nafter');
 assert.equal(mid.start,mid.end);
 assert.equal(mid.start,'before\n[quote]\n引用内容\n[/quote]\n\n'.length);
 const withSel=insertQuoteBlock({value:'ab',start:1,end:2});
 assert.equal(withSel.value,'a\n\n[quote]\nb\n[/quote]\n');
 const atStart=insertQuoteBlock({value:'',start:0,end:0});
 assert.equal(atStart.value,'[quote]\n引用内容\n[/quote]\n');
});

test('spoiler and details blocks insert with padding and caret after them',async()=>{
 const { insertSpoilerBlock, insertDetailsBlock } = await import('../lib/editor');
 const sp=insertSpoilerBlock({value:'x',start:1,end:1});
 assert.equal(sp.value,'x\n\n[spoiler]\n剧透内容\n[/spoiler]\n');
 const dt=insertDetailsBlock({value:'',start:0,end:0});
 assert.equal(dt.value,'[details="点击展开"]\n折叠内容\n[/details]\n');
 const wrap=insertSpoilerBlock({value:'ab',start:1,end:2});
 assert.equal(wrap.value,'a\n\n[spoiler]\nb\n[/spoiler]\n');
});
