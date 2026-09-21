// ตัวแทน body-parser เฉพาะตอน bundle ขึ้น Cloudflare Workers (ผูกผ่าน "alias" ใน wrangler.jsonc)
//
// express/lib/express.js อ่าน bodyParser.json/raw/text/urlencoded ตั้งแต่ตอน require
// ซึ่งลาก raw-body -> iconv-lite เข้ามา แล้ว iconv-lite พังบน Workers ด้วย
// "require_streams(...) is not a function" ก่อนแอปจะได้บูตด้วยซ้ำ
//
// แอปนี้ไม่ได้ใช้ parser ของ Express แล้ว (ใช้ src/bodyParser.js) จึงแทนด้วยตัวเปล่าได้
// ถ้าวันหนึ่งมีโค้ดเผลอเรียก express.json() บน Workers จะพังดังๆ ตรงนี้ แทนที่จะเงียบ
function unavailable(name) {
  return function () {
    throw new Error(`express.${name}() ใช้ไม่ได้บน Workers — ใช้ src/bodyParser.js แทน`);
  };
}

module.exports = {
  json: unavailable('json'),
  raw: unavailable('raw'),
  text: unavailable('text'),
  urlencoded: unavailable('urlencoded'),
};
