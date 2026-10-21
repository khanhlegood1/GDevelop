"use strict";

/* ============================================================
   GON — Game Of Nurture for Heroes 18+
   Client prototype. Production contracts (Gemini/ADK/FastChat)
   are represented by deterministic local adapters; no network
   calls and no secrets live in this file.
   ============================================================ */

const EMBEDDING_DIMENSIONS = 768;
const LEVELS = [
  { key: "zero", name: "Zero", icon: "○", xp: 0, note: "Điểm bắt đầu" },
  { key: "awaken", name: "Awaken", icon: "◐", xp: 100, note: "Thức tỉnh tò mò" },
  { key: "explorer", name: "Explorer", icon: "✦", xp: 300, note: "Khám phá có hệ thống" },
  { key: "guardian", name: "Guardian", icon: "⬡", xp: 700, note: "Bảo vệ tri thức & cộng đồng" },
  { key: "hero", name: "Hero", icon: "◆", xp: 1200, note: "Hành động tạo tác động" },
  { key: "legend", name: "Legend", icon: "♛", xp: 2000, note: "Dẫn dắt người khác" },
  { key: "forever", name: "Forever", icon: "∞", xp: 3500, note: "Học tập suốt đời" }
];

const AGENTS = [
  ["Source Intake", "Chuẩn hóa text/file/image/link, hash và quyền sử dụng"],
  ["Safety & Scope", "Chặn chủ đề rác, gắn cảnh báo y tế/tài chính"],
  ["Research Brief", "Nghiên cứu tổng quan và nguồn nền"],
  ["Concept Mapper", "Trích khái niệm, kỹ năng, quan hệ tri thức"],
  ["Learning Architect", "Thiết kế outcome và lộ trình theo mục tiêu"],
  ["Quest Designer", "Biến bài học thành mission/game loop"],
  ["Quiz Smith", "Sinh quiz có schema và giải thích"],
  ["Practice Lab", "Reorder, flashcards, thử thách thực hành"],
  ["Real-world Mission", "Nhiệm vụ đời thật và tác động cộng đồng"],
  ["Proof Curator", "Rubric bằng chứng, provenance, cấp xác minh"],
  ["Assembler", "Lắp module, embedding, metadata và xuất bản"]
];

const STOP_WORDS = new Set(("va la cua cho voi mot cac nay do de tu trong tren duoi khi thi se da dang duoc co khong nhung hay hoac nhu ve theo tai ra vao len xuong qua truoc sau hon rat cung chi can muon hoc hiểu biet lam the nao gi toi ban minh chung ta người dung noi dung chu de gon").split(/\s+/));
const CONCEPT_LEXICON = {
  health: { label: "Sức khỏe", aliases: ["suc khoe", "health", "wellness", "y te", "medical", "co the", "dinh duong", "ngu", "thien"] },
  blood: { label: "Hiến máu", aliases: ["hien mau", "blood", "donation", "donate", "truyen mau", "huyet"] },
  ai: { label: "Trí tuệ nhân tạo", aliases: ["ai", "gemini", "llm", "agent", "multi agent", "adk", "prompt", "model", "chatbot", "tri tue nhan tao"] },
  vector: { label: "Vector & Semantic Search", aliases: ["vector", "embedding", "embeddings", "semantic", "tim kiem ngu nghia", "cosine", "768"] },
  game: { label: "Game học tập", aliases: ["game", "gdevelop", "quest", "xp", "level", "guild", "tro choi", "gamification", "game hoa"] },
  proof: { label: "Proof & POAP", aliases: ["poap", "sbt", "proof", "badge", "chung chi", "certificate", "bang chung", "huy hieu", "chung nhan"] },
  habit: { label: "Thói quen", aliases: ["thoi quen", "habit", "daily", "routine", "ky luat", "streak", "ngu som", "di bo", "uong nuoc"] },
  learning: { label: "Học sâu", aliases: ["hoc", "learning", "quiz", "flashcard", "ghi nho", "retrieval", "ky nang", "khoa hoc", "module"] },
  community: { label: "Cộng đồng", aliases: ["cong dong", "community", "tinh nguyen", "guild", "nhan van", "ho tro", "lan toa"] },
  finance: { label: "Tài chính cá nhân", aliases: ["tai chinh", "finance", "tien", "tiet kiem", "dau tu", "ngan sach", "token", "crypto"] },
  presentation: { label: "Thuyết trình", aliases: ["thuyet trinh", "presentation", "ke chuyen", "storytelling", "noi truoc cong chung", "slide"] },
  data: { label: "Dữ liệu", aliases: ["data", "du lieu", "database", "convex", "postgres", "api", "backend"] },
  design: { label: "Thiết kế", aliases: ["thiet ke", "design", "ux", "ui", "arena", "giao dien", "brand", "logo"] },
  career: { label: "Sự nghiệp", aliases: ["su nghiep", "career", "cv", "phong van", "cong viec", "portfolio"] },
  climate: { label: "Khí hậu & môi trường", aliases: ["khi hau", "climate", "moi truong", "carbon", "nang luong tai tao"] },
  language: { label: "Ngôn ngữ", aliases: ["tieng anh", "english", "ngon ngu", "language", "ielts", "giao tiep"] }
};

function normalizeText(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/[^a-z0-9#@._:/-]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(value = "") {
  return normalizeText(value).split(/\s+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}
function hashSeed(text) {
  let h1 = 2166136261, h2 = 424463550;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 3266489917); }
  return (h1 >>> 0) ^ (h2 >>> 0);
}
function mulberry32(seed) {
  return function () { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function basisVector(term) {
  const rnd = mulberry32(hashSeed(term)); const vector = new Float64Array(EMBEDDING_DIMENSIONS); let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) { const v = (rnd() + rnd() + rnd() - 1.5) / 1.5; vector[i] = v; norm += v * v; }
  norm = Math.sqrt(norm) || 1; for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) vector[i] /= norm; return vector;
}
function detectConcepts(text = "") {
  const normalized = ` ${normalizeText(text)} `; const found = [];
  for (const [key, concept] of Object.entries(CONCEPT_LEXICON)) {
    let score = 0; for (const alias of concept.aliases) if (normalized.includes(` ${alias} `) || normalized.includes(alias)) score += alias.includes(" ") ? 2 : 1;
    if (score) found.push({ key, label: concept.label, score });
  }
  return found.sort((a, b) => b.score - a.score);
}
function createEmbedding768(text = "") {
  const vector = new Float64Array(EMBEDDING_DIMENSIONS);
  const add = (term, weight) => { const basis = basisVector(term); for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) vector[i] += basis[i] * weight; };
  for (const concept of detectConcepts(text)) add(`concept:${concept.key}`, 2.4 + Math.min(2, concept.score * .35));
  const tokens = tokenize(text); const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  for (const [token, count] of [...counts.entries()].slice(0, 80)) add(`token:${token}`, .22 + Math.min(.3, count * .04));
  for (let i = 0; i < Math.min(tokens.length - 1, 30); i++) add(`bigram:${tokens[i]}_${tokens[i + 1]}`, .07);
  let norm = 0; for (const value of vector) norm += value * value; norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) vector[i] /= norm; return vector;
}
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0; let sum = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { sum += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? sum / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
function extractKeywords(text = "", limit = 12) {
  const concepts = detectConcepts(text).map((x) => x.label);
  const counts = new Map(); for (const token of tokenize(text)) counts.set(token, (counts.get(token) || 0) + 1);
  const words = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([x]) => x);
  return [...new Set([...concepts, ...words])].slice(0, limit);
}
function classifyUrl(raw = "") {
  try {
    const url = new URL(raw); const host = url.hostname.replace(/^www\./, ""); let kind = "website", id = "";
    if (host.includes("youtu.be")) { kind = "youtube"; id = url.pathname.slice(1).split("/")[0]; }
    else if (host.includes("youtube.com")) { kind = "youtube"; id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop() || ""; }
    else if (host.includes("facebook.com") || host.includes("fb.watch")) kind = "facebook";
    else if (host.includes("poap")) kind = "poap";
    else if (host.includes("github.com")) kind = "github";
    return { ok: true, kind, host, id, href: url.href, thumbnail: kind === "youtube" && id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : "" };
  } catch { return { ok: false, kind: "invalid", host: "", id: "", href: raw, thumbnail: "" }; }
}
function calculateLevel(xp = 0) {
  let current = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++) { if (xp >= LEVELS[i].xp) current = LEVELS[i]; if (xp < LEVELS[i].xp && !next) next = LEVELS[i]; }
  const span = next ? next.xp - current.xp : 1; const progress = next ? Math.min(1, Math.max(0, (xp - current.xp) / span)) : 1;
  return { current, next, progress, remaining: next ? next.xp - xp : 0 };
}
function uid(prefix = "gon") { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function localHash(text = "") { return `fnv_${(hashSeed(String(text)) >>> 0).toString(16).padStart(8, "0")}`; }
function cleanTitle(text = "", fallback = "Chủ đề học tập mới") {
  const oneLine = String(text).replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (!oneLine) return fallback; const clipped = oneLine.length > 82 ? `${oneLine.slice(0, 79)}…` : oneLine;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}
function esc(value = "") { return String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

const QUEST_TEMPLATE = (topic) => [
  { id: uid("q"), title: "Quest 01 · Chạm vào bản chất", detail: `Viết 5 câu giải thích “${topic}” bằng lời của bạn, không chép định nghĩa.`, xp: 35, type: "reflect" },
  { id: uid("q"), title: "Quest 02 · Truy vết nguồn", detail: "Chọn một khẳng định quan trọng và đối chiếu với ít nhất hai nguồn độc lập.", xp: 45, type: "research" },
  { id: uid("q"), title: "Quest 03 · Thực hành có chủ đích", detail: "Làm một bài tập nhỏ trong 20 phút và ghi lại lỗi hoặc điều chưa rõ.", xp: 55, type: "practice" },
  { id: uid("q"), title: "Quest 04 · Tạo sản phẩm", detail: "Biến điều đã học thành ghi chú, video ngắn, bản đồ khái niệm hoặc mini-game.", xp: 70, type: "create" },
  { id: uid("q"), title: "Boss Quest · Bằng chứng đời thật", detail: "Áp dụng vào một tình huống thật và nộp proof có thể kiểm chứng vào Proof Vault.", xp: 100, type: "proof" }
];
function makeModule(seed) {
  return {
    generated: false, difficulty: "Nền tảng → Trung cấp", minutes: 55, xp: 305,
    outcomes: ["Giải thích được khái niệm cốt lõi bằng ví dụ riêng", "Phân biệt được khẳng định có nguồn và suy đoán", "Hoàn thành một sản phẩm/bằng chứng có thể chia sẻ"],
    reorder: ["Chốt mục tiêu", "Nắm nền tảng", "Thực hành có phản hồi", "Tạo bằng chứng", "Phản tư & bước tiếp theo"],
    quests: QUEST_TEMPLATE(seed.title), ...seed
  };
}
const CORPUS = [
  makeModule({ id: "blood-hero", icon: "🩸", title: "Hiến máu an toàn & trở thành Guardian cộng đồng", summary: "Hiểu quy trình hiến máu tự nguyện, chuẩn bị trước/sau hiến, dấu hiệu cần gặp nhân viên y tế và cách lan tỏa hành động nhân văn mà không gây áp lực.", skills: ["Sức khỏe", "Hiến máu", "Cộng đồng"],
    concepts: [{ name: "Tự nguyện & an toàn", detail: "Quyết định hiến máu phải tự nguyện, được sàng lọc và tư vấn bởi cơ sở y tế có thẩm quyền." }, { name: "Phục hồi", detail: "Nghỉ ngơi, bù nước và theo dõi cơ thể sau hiến; thông tin cá nhân hóa phải hỏi nhân viên y tế." }, { name: "Lan tỏa có trách nhiệm", detail: "Chia sẻ trải nghiệm thật, tôn trọng riêng tư, không hứa hẹn lợi ích y khoa không có căn cứ." }],
    flashcards: [{ front: "Nguyên tắc đầu tiên", back: "Tự nguyện, minh bạch tình trạng sức khỏe và làm theo hướng dẫn của cơ sở tiếp nhận máu." }, { front: "Khi thấy chóng mặt sau hiến?", back: "Dừng hoạt động, ngồi/nằm nghỉ và báo ngay nhân viên y tế tại điểm hiến." }, { front: "Proof phù hợp", back: "Giấy chứng nhận/thẻ hiến máu hoặc POAP do ban tổ chức phát hành — cần đối chiếu issuer." }],
    quiz: [{ q: "Ai quyết định bạn đủ điều kiện hiến máu tại một buổi hiến?", options: ["Bạn bè đi cùng", "Nhân viên y tế sàng lọc tại điểm hiến", "Ứng dụng AI", "Người tổ chức sự kiện"], answer: 1, why: "AI chỉ hỗ trợ học tập; quyết định y khoa thuộc quy trình sàng lọc chính thức." }, { q: "Cách chia sẻ trải nghiệm hiến máu nào là có trách nhiệm?", options: ["Đăng ảnh người khác khi chưa xin phép", "Hứa rằng hiến máu chữa được bệnh", "Kể trải nghiệm thật và khuyến khích tìm hiểu từ nguồn y tế", "Ép bạn bè tham gia"], answer: 2, why: "Tôn trọng tự nguyện, riêng tư và không tuyên bố quá mức." }, { q: "Bằng chứng nào mạnh hơn một ảnh chụp màn hình tự khai?", options: ["Caption dài", "Chứng nhận có issuer/Mã tra cứu hoặc POAP kiểm chứng được", "Nhiều lượt like", "Ảnh đã chỉnh màu đẹp"], answer: 1, why: "Giá trị nằm ở khả năng đối chiếu với nguồn phát hành." }] }),
  makeModule({ id: "vector-search", icon: "🧭", title: "Vector Embeddings 768D & Semantic Search", summary: "Từ token đến embedding, cosine similarity, vector index và cách kết hợp full-text search với tìm kiếm ngữ nghĩa như kiến trúc WSIC.", skills: ["AI", "Dữ liệu", "Vector Search"],
    concepts: [{ name: "Embedding", detail: "Một vector số biểu diễn ý nghĩa tương đối của văn bản trong không gian nhiều chiều." }, { name: "Cosine similarity", detail: "Đo góc giữa hai vector; càng gần 1 càng giống theo biểu diễn của model." }, { name: "Hybrid search", detail: "Kết hợp khớp từ khóa chính xác với ngữ nghĩa để giảm bỏ sót và nhiễu." }],
    flashcards: [{ front: "768D nghĩa là gì?", back: "Embedding có 768 tọa độ số; đó là kích thước đầu ra được cấu hình, không phải 768 chủ đề." }, { front: "Vì sao cần text search?", back: "Tên riêng, mã và thuật ngữ chính xác thường được full-text xử lý tin cậy hơn." }, { front: "Ngưỡng không phải sự thật", back: "Similarity score phụ thuộc model/dữ liệu; phải hiệu chỉnh và kiểm thử trên tập truy vấn thật." }],
    quiz: [{ q: "Cosine similarity chủ yếu đo điều gì?", options: ["Độ dài tài liệu", "Góc/tương quan hướng giữa hai vector", "Số lượt xem", "Độ tin cậy của tác giả"], answer: 1, why: "Nó so hướng vector sau chuẩn hóa." }, { q: "Cấu hình WSIC dùng cho embedding là gì?", options: ["gemini-embedding-001 · 768D", "TF-IDF · 10D", "Ảnh thumbnail", "SQL LIKE"], answer: 0, why: "Theo docs/code WSIC: SEMANTIC_SIMILARITY và outputDimensionality 768." }, { q: "Khi không có kết quả đủ sát, GON nên làm gì?", options: ["Báo lỗi trắng", "Tự nhận một bài không liên quan", "Đề xuất Brew Your Topic", "Xóa truy vấn"], answer: 2, why: "Brew biến khoảng trống nội dung thành module mới có kiểm soát." }] }),
  makeModule({ id: "proof-humanity", icon: "⬡", title: "Proof of Humanity: POAP, SBT & bằng chứng học tập", summary: "Thiết kế thang tin cậy cho bằng chứng: hash, issuer verification, POAP/SBT, quyền riêng tư và chống gian lận thành tích.", skills: ["Proof", "POAP", "Web3 có trách nhiệm"],
    concepts: [{ name: "Provenance", detail: "Ai tạo bằng chứng, khi nào, từ hành động nào và có thể truy vết đến đâu." }, { name: "Hash không phải xác thực nội dung", detail: "Hash phát hiện thay đổi file, nhưng không chứng minh chứng chỉ là thật." }, { name: "POAP/SBT", detail: "Dấu ấn số ghi nhận tham gia/thành tích; giá trị phụ thuộc issuer và quy trình cấp phát." }],
    flashcards: [{ front: "Self-declared", back: "Người dùng tự khai; hữu ích để lưu hành trình nhưng độ tin cậy thấp nhất." }, { front: "Issuer-verified", back: "Đối chiếu được với tổ chức phát hành qua mã, API hoặc chữ ký số." }, { front: "Riêng tư", back: "Không công khai địa chỉ ví, giấy tờ hay dữ liệu sức khỏe nếu không cần thiết và không có đồng ý." }],
    quiz: [{ q: "SHA-256 của ảnh chứng chỉ chứng minh điều gì?", options: ["Chứng chỉ chắc chắn thật", "File đã thay đổi hay chưa so với lúc hash", "Người trong ảnh là chủ tài khoản", "Issuer đã duyệt"], answer: 1, why: "Hash là bằng chứng toàn vẹn file, không phải bằng chứng nguồn gốc." }, { q: "POAP đáng tin hơn khi nào?", options: ["Ảnh đẹp", "Có issuer rõ và tra cứu được sự kiện/token", "Được bán giá cao", "Nhiều emoji"], answer: 1, why: "Issuer và khả năng kiểm chứng quyết định độ tin cậy." }, { q: "Dữ liệu nào không nên công khai mặc định?", options: ["Tên badge", "Ngày nhận", "Thông tin sức khỏe/định danh nhạy cảm", "Tên kỹ năng"], answer: 2, why: "Proof công khai phải tối thiểu hóa dữ liệu." }] }),
  makeModule({ id: "ai-coach", icon: "🤖", title: "AI Coach, Daily Quest & roadmap cá nhân hoá", summary: "Biến mục tiêu dài hạn thành nhiệm vụ mỗi ngày, đo tiến độ, phản tư và điều chỉnh độ khó mà không dùng cơ chế gây nghiện.", skills: ["AI Coach", "Thói quen", "Game hoá"],
    concepts: [{ name: "Daily Quest", detail: "Một hành động nhỏ, quan sát được và hoàn thành trong ngày." }, { name: "Adaptive difficulty", detail: "Độ khó thay đổi theo kết quả và năng lượng người học, có quyền giảm tải." }, { name: "Reflection loop", detail: "Dữ liệu chỉ có giá trị khi người học nhìn lại và chọn bước tiếp theo." }],
    flashcards: [{ front: "Quest tốt", back: "Cụ thể, nhỏ, có bằng chứng hoàn thành và gắn với mục tiêu lớn." }, { front: "XP lành mạnh", back: "Thưởng cho nỗ lực/tiến bộ, không phạt nặng vì nghỉ một ngày." }, { front: "AI Coach giới hạn", back: "Không chẩn đoán y tế/tâm lý; cần escalation đến chuyên gia khi có rủi ro." }],
    quiz: [{ q: "Daily Quest nào tốt nhất?", options: ["Trở nên giỏi hơn", "Đọc và tóm tắt 1 mục trong 15 phút", "Học 8 giờ không nghỉ", "Không được sai"], answer: 1, why: "Nhỏ, đo được và có đầu ra." }, { q: "Khi người dùng liên tục thất bại, Coach nên làm gì?", options: ["Trừ hết XP", "Tăng độ khó", "Giảm bước, tìm rào cản và đề xuất hỗ trợ", "Khóa tài khoản"], answer: 2, why: "Thích ứng và hỗ trợ thay vì trừng phạt." }, { q: "Streak nên được thiết kế thế nào?", options: ["Mất tất cả nếu nghỉ", "Có ngày nghỉ/phục hồi và không tạo sợ hãi", "Bắt mua thêm lượt", "So sánh công khai bắt buộc"], answer: 1, why: "Động lực bền vững không dựa trên lo âu." }] }),
  makeModule({ id: "gdevelop-game", icon: "🎮", title: "Biến một chủ đề thành mini-game giáo dục bằng GDevelop", summary: "Chuyển outcome học tập thành scene, event, biến XP, thử thách và proof checkpoint trong GDevelop no-code.", skills: ["GDevelop", "Thiết kế game", "Học sâu"],
    concepts: [{ name: "Learning verb trước mechanic", detail: "Xác định người học phải làm gì (phân loại, sắp xếp, ra quyết định) trước khi chọn thể loại game." }, { name: "Event & variable", detail: "GDevelop event sheet mô tả điều kiện → hành động; biến lưu điểm, trạng thái và tiến độ." }, { name: "Proof checkpoint", detail: "Cuối màn chơi yêu cầu sản phẩm/quyết định có thể đánh giá, không chỉ bấm qua màn." }],
    flashcards: [{ front: "Bắt đầu từ đâu?", back: "Một outcome, một màn chơi dọc (vertical slice), một vòng phản hồi rõ ràng." }, { front: "XP nên gắn với gì?", back: "Hành vi học tập mong muốn: thử lại có chiến lược, dùng gợi ý hợp lý, tạo bằng chứng." }, { front: "Tránh gì?", back: "Quiz phủ đồ họa nhưng không có quyết định/thử thách liên quan nội dung." }],
    quiz: [{ q: "Thứ tự thiết kế đúng là gì?", options: ["Đồ họa → âm thanh → outcome", "Outcome → hành vi học → mechanic → feedback", "Leaderboard trước", "Token trước"], answer: 1, why: "Game phục vụ mục tiêu học, không phải ngược lại." }, { q: "Biến trong GDevelop dùng để làm gì?", options: ["Lưu trạng thái như XP, máu, tiến độ", "Thay thế mọi event", "Tự sinh nội dung AI", "Chứng minh chứng chỉ"], answer: 0, why: "Variable giữ dữ liệu trạng thái của game." }, { q: "Proof checkpoint tốt là gì?", options: ["Xem quảng cáo", "Tạo/ra quyết định và lưu kết quả đánh giá được", "Bấm nút 100 lần", "Chờ 24 giờ"], answer: 1, why: "Bằng chứng phải thể hiện năng lực." }] }),
  makeModule({ id: "adk-agents", icon: "🧩", title: "Multi-agent Google ADK cho Brew Your Topic", summary: "Thiết kế SequentialAgent, output schema, phân tầng model, hàng đợi QStash và idempotency để sinh module không trùng lặp.", skills: ["Google ADK", "AI", "Backend"],
    concepts: [{ name: "SequentialAgent", detail: "Các agent chạy tuần tự và truyền dữ liệu qua output_key/state có kiểm soát." }, { name: "Output schema", detail: "Ràng buộc JSON giúp phát hiện lỗi tại bước sinh thay vì ở giao diện cuối." }, { name: "Idempotency", detail: "Retry không được tạo hai module giống nhau; cần khóa request và trạng thái bền vững." }],
    flashcards: [{ front: "Vì sao không một prompt khổng lồ?", back: "Khó ràng buộc kiểu, khó debug và dễ vượt giới hạn đầu ra." }, { front: "Phân tầng model", back: "Model mạnh cho nghiên cứu/quyết định; model nhẹ cho nhiệm vụ có schema chặt." }, { front: "Điểm ghi dữ liệu", back: "Nên có một cổng ghi cuối pipeline để kiểm soát tính toàn vẹn." }],
    quiz: [{ q: "Output schema giúp gì nhất?", options: ["Tăng màu sắc UI", "Biến kỳ vọng đầu ra thành hợp đồng kiểm tra được", "Bỏ qua kiểm duyệt", "Giảm số agent về 0"], answer: 1, why: "Schema bắt lỗi hình dạng dữ liệu sớm." }, { q: "Retry an toàn cần gì?", options: ["Tạo ID mới mỗi lần", "Idempotency key và bảng trạng thái request", "Xóa log", "Chạy song song vô hạn"], answer: 1, why: "Cùng request phải cho cùng một kết quả ghi nhận." }, { q: "Agent kiểm duyệt chủ đề nên chạy khi nào?", options: ["Sau 4 phút sinh", "Trước pipeline đắt tiền", "Chỉ khi người dùng báo cáo", "Không cần"], answer: 1, why: "Chặn sớm tiết kiệm chi phí và giảm rủi ro." }] }),
  makeModule({ id: "healthy-habits", icon: "🌿", title: "Sức khỏe toàn diện bằng thói quen nhỏ", summary: "Thiết kế hệ thói quen ngủ, vận động, nước, tập trung và phục hồi theo bằng chứng hành vi — không hứa hẹn chữa bệnh.", skills: ["Sức khỏe", "Thói quen", "Tự phát triển"],
    concepts: [{ name: "Habit loop", detail: "Tín hiệu → hành động nhỏ → phần thưởng/phản hồi → lặp lại trong bối cảnh ổn định." }, { name: "Environment design", detail: "Thay đổi môi trường thường bền hơn chỉ dựa vào ý chí." }, { name: "Recovery", detail: "Nghỉ ngơi là phần của hiệu suất và học tập, không phải phần thưởng sau kiệt sức." }],
    flashcards: [{ front: "Thói quen 2 phút", back: "Thu nhỏ hành động đến mức dễ bắt đầu: mang giày, mở sổ, rót nước." }, { front: "Đo gì?", back: "Đo hành vi đã làm và cảm nhận chủ quan; tránh tự chẩn đoán từ một chỉ số." }, { front: "Dấu hiệu cần chuyên gia", back: "Triệu chứng kéo dài, đau, mất ngủ nghiêm trọng hoặc nguy cơ an toàn cần gặp chuyên môn." }],
    quiz: [{ q: "Cách bắt đầu thói quen bền nhất?", options: ["Thay đổi mọi thứ cùng lúc", "Một hành động rất nhỏ gắn vào tín hiệu có sẵn", "Chờ có động lực lớn", "Tự phạt khi quên"], answer: 1, why: "Ma sát thấp giúp lặp lại." }, { q: "AI Coach không nên làm gì?", options: ["Nhắc uống nước", "Gợi ý ghi nhật ký", "Chẩn đoán bệnh từ vài triệu chứng", "Đề xuất nghỉ"], answer: 2, why: "Chẩn đoán thuộc chuyên môn y tế." }, { q: "Môi trường tốt cho việc đọc sách là gì?", options: ["Điện thoại cạnh gối và TV mở", "Sách ở nơi dễ thấy, thông báo tắt 20 phút", "Chỉ đọc khi hoàn hảo", "Đọc lúc quá buồn ngủ"], answer: 1, why: "Giảm ma sát và nhiễu." }] }),
  makeModule({ id: "deep-learning", icon: "🧠", title: "Học sâu bằng Retrieval Practice, Quiz & Flashcards", summary: "Dùng truy hồi chủ động, giãn cách, interleaving và phản hồi để biến đọc lướt thành trí nhớ dùng được.", skills: ["Học sâu", "Trí nhớ", "Kỹ năng"],
    concepts: [{ name: "Retrieval practice", detail: "Tự nhớ lại trước khi xem đáp án giúp củng cố trí nhớ hơn đọc lại thụ động." }, { name: "Spacing", detail: "Ôn cách quãng theo thời gian thay vì nhồi một lần." }, { name: "Feedback", detail: "Giải thích vì sao sai giúp sửa mô hình tư duy, không chỉ biết đáp án." }],
    flashcards: [{ front: "Đọc lại ≠ nhớ", back: "Cảm giác quen thuộc dễ đánh lừa; hãy tự kiểm tra không nhìn tài liệu." }, { front: "Flashcard tốt", back: "Một ý, câu hỏi rõ, đáp án ngắn và có ví dụ áp dụng." }, { front: "Interleaving", back: "Xen kẽ loại bài tương tự để học cách phân biệt khi nào dùng kỹ thuật nào." }],
    quiz: [{ q: "Hoạt động nào là retrieval practice?", options: ["Tô highlight", "Tự trả lời trước khi xem đáp án", "Đọc nhanh lại", "Chụp ảnh slide"], answer: 1, why: "Truy hồi chủ động tạo nỗ lực ghi nhớ." }, { q: "Spacing hiệu quả vì sao?", options: ["Quên hết rồi học mới", "Ôn khi bắt đầu quên giúp củng cố dài hạn", "Học càng khuya càng tốt", "Không cần phản hồi"], answer: 1, why: "Khoảng cách vừa đủ tạo độ khó có lợi." }, { q: "Flashcard nào tốt hơn?", options: ["Một thẻ chứa cả chương", "Một câu hỏi, một ý, một ví dụ", "Chỉ ghi đáp án", "Không bao giờ ôn thẻ sai"], answer: 1, why: "Thẻ nguyên tử dễ truy hồi và lên lịch ôn." }] })
];
for (const item of CORPUS) item.embedding = createEmbedding768(`${item.title} ${item.summary} ${item.skills.join(" ")} ${item.concepts.map((c) => `${c.name} ${c.detail}`).join(" ")}`);

function searchCorpus(query, embedding = createEmbedding768(query), limit = 5) {
  const qTokens = new Set(tokenize(query));
  const qConcepts = new Set(detectConcepts(query).map((x) => x.key));
  const generic = new Set(["hoc", "tap", "thiet", "ke", "chu", "de", "noi", "dung", "module"]);
  const fullTexts = CORPUS.map((item) => `${item.title} ${item.summary} ${item.skills.join(" ")} ${item.concepts.map((c) => `${c.name} ${c.detail}`).join(" ")}`);
  const docTokens = fullTexts.map((text) => new Set(tokenize(text)));
  // Distinctive coverage prevents a generic learning query from looking like
  // a strong match for an unrelated specific topic (the Brew trigger).
  const distinctive = [...qTokens].filter((token) => !generic.has(token) && docTokens.filter((set) => set.has(token)).length <= Math.ceil(CORPUS.length / 2));
  return CORPUS.map((item, index) => {
    const semantic = cosineSimilarity(embedding, item.embedding);
    const titleTokens = new Set(tokenize(`${item.title} ${item.summary} ${item.skills.join(" ")}`));
    const overlap = [...qTokens].filter((t) => titleTokens.has(t)).length / Math.max(1, qTokens.size);
    const specificCoverage = distinctive.length ? distinctive.filter((t) => docTokens[index].has(t)).length / distinctive.length : overlap;
    const iConcepts = new Set(detectConcepts(fullTexts[index]).map((x) => x.key));
    const conceptOverlap = [...qConcepts].filter((c) => iConcepts.has(c)).length / Math.max(1, qConcepts.size);
    const score = Math.max(0, Math.min(1, semantic * .46 + overlap * .16 + specificCoverage * .28 + conceptOverlap * .10));
    return { item, score, semantic, overlap, conceptOverlap, specificCoverage };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}
function createBrewModule(topic, context = {}) {
  const title = cleanTitle(topic, "Hành trình học tập mới");
  const keywords = context.keywords?.length ? context.keywords : extractKeywords(topic);
  const core = keywords.slice(0, 4).length ? keywords.slice(0, 4) : ["Nền tảng", "Cơ chế", "Ứng dụng", "Bằng chứng"];
  const concepts = core.map((term, i) => ({ name: `${i + 1}. ${term}`, detail: `Khám phá “${term}” trong mối liên hệ với ${title}: định nghĩa vận hành, ví dụ, giới hạn và câu hỏi cần kiểm chứng từ nguồn gốc.` }));
  while (concepts.length < 3) concepts.push({ name: `${concepts.length + 1}. Ứng dụng thực tế`, detail: `Chuyển ${title} thành một hành động nhỏ có thể quan sát và đo kết quả.` });
  return makeModule({
    id: uid("brew"), generated: true, icon: "✦", title: `Brew: ${title}`,
    summary: `Module demo được “brew” cục bộ từ input của bạn${context.sourceCount ? ` và ${context.sourceCount} nguồn đính kèm` : ""}. Bản production sẽ dùng ADK + nghiên cứu có trích dẫn, kiểm chứng nguồn và cá nhân hóa theo hồ sơ Hero.`,
    skills: core, concepts,
    flashcards: concepts.slice(0, 3).map((c) => ({ front: c.name.replace(/^\d+\.\s*/, ""), back: c.detail })),
    quiz: [
      { q: `Bước đầu tiên tốt nhất để học “${title}” là gì?`, options: ["Nhớ mọi chi tiết ngay", "Chốt câu hỏi học tập và khái niệm nền cần kiểm chứng", "Chỉ xem video tốc độ 2x", "Bỏ qua nguồn gốc"], answer: 1, why: "Một câu hỏi rõ giúp chọn nguồn và tiêu chí hoàn thành." },
      { q: "Bằng chứng học tập nào có giá trị hơn?", options: ["Ảnh chụp màn hình không ngữ cảnh", "Sản phẩm/giải thích kèm nguồn và quá trình làm", "Cảm giác đã hiểu", "Số giờ ngồi trước màn hình"], answer: 1, why: "Bằng chứng cần cho thấy năng lực và truy vết được quá trình." },
      { q: "Khi AI đưa ra một khẳng định chưa có nguồn, bạn nên làm gì?", options: ["Chia sẻ ngay", "Đánh dấu chưa kiểm chứng và tìm nguồn độc lập", "Xóa câu hỏi", "Tin vì văn phong tự tin"], answer: 1, why: "Độ tự tin của văn bản không thay thế kiểm chứng." }
    ],
    realWorld: `Hoàn thành một nhiệm vụ thật liên quan đến ${title}, ghi lại quyết định, kết quả và bằng chứng trước khi nhận badge.`
  });
}

const VERIFICATION_LEVELS = [
  { level: 0, icon: "○", name: "Self-declared", description: "Người dùng tự khai; chỉ dùng để theo dõi cá nhân." },
  { level: 1, icon: "◐", name: "Source-linked", description: "Có link/file và hash; chưa đối chiếu issuer/chủ sở hữu." },
  { level: 2, icon: "⬡", name: "System-recorded", description: "GON ghi nhận hành động trong hệ thống (quiz, quest, module)." },
  { level: 3, icon: "◆", name: "Issuer-verified", description: "Đối chiếu được tổ chức phát hành hoặc chữ ký số." },
  { level: 4, icon: "∞", name: "Anchored", description: "Neo bằng POAP/SBT/sổ cái công khai vẫn giữ provenance off-chain." }
];
const INTEGRATIONS = [
  ["Google OAuth", "Demo only", "Prototype không gửi credential; production dùng Google OAuth/Better Auth như WSIC."],
  ["Gemini Embeddings 768D", "Local adapter", "Demo dùng deterministic embedder 768D; production gọi gemini-embedding-001 ở server."],
  ["Google ADK Brew", "Simulated pipeline", "11 bước được mô phỏng có trạng thái; production chạy bất đồng bộ qua queue + idempotency."],
  ["File/Image ingestion", "Browser metadata", "Text đọc tại client, ảnh/PDF ghi metadata + hash; OCR/transcript/extraction ở worker production."],
  ["POAP / SBT", "Record-ready", "Lưu issuer/token/provenance; chưa xác minh on-chain trong prototype."],
  ["GDevelop export", "Blueprint", "Module có outcome/quest/XP/proof checkpoint để chuyển thành scene + events + variables."]
];
const FLOW = [
  ["⌁", "Ingest", "Text, file, ảnh, video và link trở thành Source Artifact có hash."],
  ["◎", "Understand", "Trích keyword, entity, mục tiêu và mức độ nhạy cảm."],
  ["⬡", "Embed", "Gemini tạo vector 768D; lưu cùng provenance."],
  ["⌕", "Search", "Full-text + vector; phân loại found / related / missing."],
  ["✦", "Brew", "ADK sinh module nếu chưa có nội dung đủ sát."],
  ["♛", "Prove", "Quest tạo XP; proof được xác minh và neo vào hành trình."]
];

/* ---------------- State ---------------- */
const STORAGE_KEY = "gon-hero-18plus-v2";
let state = loadState();
let pendingSources = [];
let pendingProofFile = null;
let currentRun = null;
let projectFilter = "";

function defaultState() {
  const now = new Date().toISOString();
  const seedProjectId = "project_seed_zofo";
  return {
    user: null, xp: 90, activeProjectId: seedProjectId, daily: {},
    projects: [{
      id: seedProjectId, title: "Từ hiến máu nhân văn đến Guardian cộng đồng", topic: "hiến máu sức khỏe proof cộng đồng", goal: "impact", depth: "deep", privacy: "private", status: "learning", createdAt: now, updatedAt: now,
      sources: [{ id: "src_zofo", kind: "website", title: "ZoFo · Zero to Forever Foundation", url: "https://www.hienmaunhanvan.com/", detail: "Nguồn định hướng do người dùng cung cấp; chưa ingest toàn văn trong prototype.", hash: localHash("https://www.hienmaunhanvan.com/") }],
      keywords: ["Hiến máu", "Sức khỏe", "Proof & POAP", "Cộng đồng"], module: clone(CORPUS[0]), completedQuestIds: [CORPUS[0].quests[0].id], quiz: null, reorderPassed: false, badge: null, arenaPath: "merged"
    }],
    proofs: [{ id: "proof_seed", type: "source", title: "Nguồn học tập: ZoFo — Zero to Forever", url: "https://www.hienmaunhanvan.com/", issuer: "Website do người dùng chỉ định", projectId: seedProjectId, notes: "Nguồn tham chiếu định vị, chưa phải bằng chứng thành tích cá nhân.", status: "Source-linked", level: 1, hash: localHash("zofo-source"), isPublic: false, createdAt: now }],
    events: [
      { id: uid("ev"), icon: "⬡", title: "Đã tạo dự án học tập mẫu", detail: "Hiến máu nhân văn gắn với hành trình Zero to Forever.", xp: 20, createdAt: now, projectId: seedProjectId },
      { id: uid("ev"), icon: "✦", title: "Hoàn thành Quest 01 (demo seed)", detail: "Dữ liệu mẫu để bạn thấy cách XP và timeline vận hành; có thể Reset demo.", xp: 35, createdAt: now, projectId: seedProjectId },
      { id: uid("ev"), icon: "⌁", title: "Gắn nguồn vào Proof Vault", detail: "Nguồn được xếp Source-linked, chưa issuer-verified.", xp: 35, createdAt: now, projectId: seedProjectId }
    ]
  };
}
function loadState() {
  try {
    if (typeof localStorage === "undefined") return defaultState();
    const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const parsed = JSON.parse(raw); if (parsed && Array.isArray(parsed.projects)) return parsed; }
  } catch (e) { console.warn("Cannot load GON state", e); }
  return defaultState();
}
function saveState() {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn("Cannot save GON state", e); toast("Bộ nhớ trình duyệt đã đầy; hãy xuất JSON và giảm file ảnh proof."); }
}
function activeProject() { return state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0] || null; }
function addXP(amount, title, detail, projectId = state.activeProjectId, icon = "✦") {
  const before = calculateLevel(state.xp).current.key; state.xp += amount;
  state.events.unshift({ id: uid("ev"), icon, title, detail, xp: amount, createdAt: new Date().toISOString(), projectId });
  const after = calculateLevel(state.xp); saveState(); renderAll();
  toast(before !== after.current.key ? `Lên cấp ${after.current.name}! +${amount} XP` : `+${amount} XP · ${title}`);
}
function toast(message) {
  const el = document.getElementById("toast"); if (!el) return; el.textContent = message; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 3400);
}
function fmtDate(iso) { try { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return ""; } }
async function sha256(blobOrText) {
  try {
    if (!crypto?.subtle) return localHash(typeof blobOrText === "string" ? blobOrText : `${blobOrText.name}-${blobOrText.size}`);
    const buffer = typeof blobOrText === "string" ? new TextEncoder().encode(blobOrText) : await blobOrText.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  } catch { return localHash(String(blobOrText)); }
}

/* ---------------- Gate / auth demo ---------------- */
function enterApp(name, email) {
  const age = document.getElementById("age-confirm");
  if (!age.checked) { toast("GON 18+ cần bạn xác nhận đủ 18 tuổi trước khi vào."); age.focus(); return; }
  state.user = { name: (name || "Hero Demo").trim() || "Hero Demo", email: (email || "hero.demo@gon.org").trim() || "hero.demo@gon.org", provider: "google-demo", ageSelfDeclared: true, signedInAt: new Date().toISOString() };
  saveState(); document.getElementById("gate").hidden = true; document.getElementById("app").hidden = false; renderAll(); toast(`Xin chào ${state.user.name}. Hành trình Hero đã mở.`);
}
function signOut() { state.user = null; saveState(); document.getElementById("app").hidden = true; document.getElementById("gate").hidden = false; }

/* ---------------- Sources ---------------- */
function sourceLabel(source) { return { text: "Text", file: "File", image: "Hình ảnh", video: "Video", youtube: "YouTube", facebook: "Facebook", website: "Website", poap: "POAP", github: "GitHub" }[source.kind] || source.kind; }
function renderSources() {
  const wrap = document.getElementById("source-chips");
  document.getElementById("input-counter").textContent = `${pendingSources.length} nguồn`;
  wrap.innerHTML = pendingSources.map((s) => `<span class="source-chip">${s.thumbnail ? `<img src="${esc(s.thumbnail)}" alt="">` : ""}<span>${esc(sourceLabel(s))}</span><b title="${esc(s.title)}">${esc(s.title)}</b><button type="button" data-remove-source="${esc(s.id)}" aria-label="Xóa ${esc(s.title)}">×</button></span>`).join("");
  wrap.querySelectorAll("[data-remove-source]").forEach((btn) => btn.addEventListener("click", () => { pendingSources = pendingSources.filter((x) => x.id !== btn.dataset.removeSource); renderSources(); }));
}
function addUrlSource(raw, title = "") {
  const info = classifyUrl(raw); if (!info.ok) { toast("URL chưa hợp lệ. Hãy dán đầy đủ https://…"); return false; }
  if (pendingSources.some((s) => s.url === info.href)) return true;
  pendingSources.push({ id: uid("src"), kind: info.kind, title: title || `${info.host}${info.id ? ` · ${info.id}` : ""}`, url: info.href, detail: info.kind === "youtube" ? "Video source · production sẽ lấy metadata/transcript qua API chính thức." : info.kind === "facebook" ? "Facebook source · chỉ ingest nội dung công khai hoặc qua OAuth chính thức." : "Web source · production ingest ở server kèm trích dẫn.", thumbnail: info.thumbnail, text: `${title} ${info.host} ${info.id}` });
  renderSources(); return true;
}
function extractUrls(text) { return [...new Set((String(text).match(/https?:\/\/[^\s<>"')]+/g) || []).map((u) => u.replace(/[.,;!?]+$/, "")))]; }
async function processFiles(files) {
  for (const file of [...files]) {
    const isText = /^(text\/|application\/(json|xml|x-subrip))/.test(file.type) || /\.(txt|md|csv|html|srt)$/i.test(file.name);
    const source = { id: uid("src"), kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file", title: file.name, mime: file.type || "unknown", size: file.size, detail: `${file.type || "Không rõ MIME"} · ${(file.size / 1024).toFixed(1)} KB`, hash: await sha256(file), text: file.name };
    if (isText) { source.text = (await file.text()).slice(0, 200000); source.detail += ` · đã đọc ${source.text.length.toLocaleString("vi-VN")} ký tự tại trình duyệt`; }
    else if (source.kind === "image") { source.thumbnail = await fileToDataURL(file, 520); source.detail += " · OCR/vision sẽ chạy ở production worker"; }
    else if (source.kind === "video") source.detail += " · transcript sẽ chạy ở production worker";
    else source.detail += " · parser production sẽ trích nội dung";
    pendingSources.push(source);
  }
  renderSources(); toast(`Đã gắn ${files.length} file vào input học tập.`);
}
function fileToDataURL(file, maxWidth = 720) {
  return new Promise((resolve) => {
    const reader = new FileReader(); reader.onload = () => {
      const img = new Image(); img.onload = () => { const scale = Math.min(1, maxWidth / img.width); const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .78)); }; img.onerror = () => resolve(reader.result); img.src = reader.result;
    }; reader.onerror = () => resolve(""); reader.readAsDataURL(file);
  });
}

/* ---------------- Search & Brew ---------------- */
function setPipeline(stepIndex, done = false) {
  const el = document.getElementById("agent-timeline");
  el.innerHTML = AGENTS.map(([name], i) => `<div class="agent-dot ${done || i < stepIndex ? "done" : i === stepIndex ? "running" : ""}"><i>${done || i < stepIndex ? "✓" : i + 1}</i>${esc(name)}</div>`).join("");
  document.getElementById("pipeline-status").textContent = done ? "Complete" : `Agent ${Math.min(stepIndex + 1, AGENTS.length)}/${AGENTS.length}`;
  document.getElementById("pipeline-status").className = `status-pill ${done ? "success" : "gold"}`;
}
function drawVector(vector) {
  const canvas = document.getElementById("vector-canvas"); if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return; const { width, height } = canvas; ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
  const values = [...vector.slice(0, 64)]; const max = Math.max(...values.map(Math.abs), .001); const bw = width / values.length;
  values.forEach((v, i) => { const h = Math.abs(v) / max * (height / 2 - 8); ctx.fillStyle = v >= 0 ? "#38d5f5" : "#f04452"; ctx.fillRect(i * bw + 1, v >= 0 ? height / 2 - h : height / 2, Math.max(2, bw - 2), h); });
  const norm = Math.sqrt([...vector].reduce((a, b) => a + b * b, 0)); document.getElementById("vector-norm").textContent = `· norm ${norm.toFixed(3)}`;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function analyzeInput(event) {
  event?.preventDefault();
  const promptEl = document.getElementById("prompt"); let prompt = promptEl.value.trim();
  for (const url of extractUrls(prompt)) addUrlSource(url);
  const sourceText = pendingSources.map((s) => `${s.title} ${s.text || ""} ${s.url || ""}`).join("\n");
  const fullText = `${prompt}\n${sourceText}`.trim();
  if (!fullText) { toast("Hãy nhập một chủ đề hoặc đính kèm nguồn học tập."); promptEl.focus(); return; }
  const title = cleanTitle(prompt || pendingSources[0]?.title || "Dự án học tập mới");
  const project = { id: uid("project"), title, topic: prompt || title, goal: document.getElementById("goal-select").value, depth: document.getElementById("depth-select").value, privacy: document.getElementById("privacy-select").value, status: "researching", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sources: clone(pendingSources), keywords: extractKeywords(fullText), module: null, completedQuestIds: [], quiz: null, reorderPassed: false, badge: null, arenaPath: null };
  if (!project.sources.length && prompt) project.sources.push({ id: uid("src"), kind: "text", title: "Prompt của Hero", detail: prompt.slice(0, 240), text: prompt, hash: localHash(prompt) });
  state.projects.unshift(project); state.activeProjectId = project.id; saveState(); renderAll();
  document.getElementById("pipeline").hidden = false; document.getElementById("results").hidden = true; document.getElementById("arena-compare").hidden = true; document.getElementById("module-panel").hidden = true;
  document.getElementById("keyword-cloud").innerHTML = project.keywords.map((k) => `<span>${esc(k)}</span>`).join("");
  const embedding = createEmbedding768(fullText); drawVector(embedding);
  for (let i = 0; i < AGENTS.length; i++) { setPipeline(i); document.getElementById("pipeline-title").textContent = `${AGENTS[i][0]} — ${AGENTS[i][1]}`; await wait(i < 3 ? 110 : 65); }
  setPipeline(AGENTS.length, true); document.getElementById("pipeline-title").textContent = "Đã hiểu input và sẵn sàng đối chiếu kho tri thức.";
  const results = searchCorpus(fullText, embedding, 5);
  currentRun = { projectId: project.id, fullText, embedding: [...embedding], results, keywords: project.keywords };
  addXP(15, "Tạo dự án & phân tích input", `“${title}” đã được vector hóa 768D và tìm trong kho GON.`, project.id, "⌁");
  renderResults(results); renderCompare(project, results[0]);
  document.getElementById("pipeline").scrollIntoView({ behavior: "smooth", block: "start" });
}
function renderResults(results) {
  const panel = document.getElementById("results"); panel.hidden = false;
  const found = results.filter((r) => r.score >= .58); const related = results.filter((r) => r.score >= .34);
  const verdict = document.getElementById("search-verdict");
  verdict.textContent = found.length ? `${found.length} kết quả đủ sát` : related.length ? "Chỉ có nội dung liên quan" : "Không có kết quả đủ sát";
  verdict.className = `status-pill ${found.length ? "success" : "warn"}`;
  document.getElementById("results-title").textContent = found.length ? "Tìm thấy module phù hợp" : "Kho hiện có chưa đủ sát với mục tiêu";
  document.getElementById("brew-panel").hidden = found.length > 0;
  const list = document.getElementById("result-list");
  list.innerHTML = (found.length ? found : related).map(({ item, score, semantic }) => `
    <article class="result-card">
      <div class="result-icon" aria-hidden="true">${esc(item.icon)}</div>
      <div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="meta-row"><span>${esc(item.difficulty)}</span><span>~${item.minutes} phút</span><span>${item.xp} XP</span>${item.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</div></div>
      <div class="score-wrap"><strong>${Math.round(score * 100)}% match</strong><div class="score-bar"><i style="width:${Math.round(score * 100)}%"></i></div><small class="muted">cosine ${semantic.toFixed(3)} · demo score</small><br><button class="secondary-btn" data-open-module="${esc(item.id)}" type="button">Mở module</button></div>
    </article>`).join("") || `<div class="empty">Chưa có module liên quan trong kho demo. Đây chính là lúc Brew Your Topic phát huy tác dụng.</div>`;
  list.querySelectorAll("[data-open-module]").forEach((btn) => btn.addEventListener("click", () => openModule(CORPUS.find((x) => x.id === btn.dataset.openModule), "search")));
}
function renderCompare(project, topResult) {
  const wrap = document.getElementById("arena-compare"); wrap.hidden = false;
  const topic = topResult?.item?.title || project.title; const concepts = topResult?.item?.concepts?.map((c) => c.name) || project.keywords.slice(0, 4);
  document.getElementById("coach-path").innerHTML = `<p><strong>${esc(topic)}</strong></p><ul><li>Đọc brief có nguồn, sau đó deep-dive theo ${concepts.map(esc).join(", ") || "khái niệm cốt lõi"}.</li><li>AI Coach hỏi kiểm tra từng bước và chỉ ra khẳng định chưa kiểm chứng.</li><li>Kết thúc bằng bản đồ tri thức + câu hỏi còn mở.</li></ul><p class="hint">Phù hợp khi bạn cần hiểu sâu/trình bày lại.</p>`;
  document.getElementById("quest-path").innerHTML = `<p><strong>Quest hóa “${esc(project.title)}”</strong></p><ul><li>5 quest từ chạm bản chất → truy vết nguồn → thực hành → tạo sản phẩm → Boss Proof.</li><li>Quiz, reorder và flashcard tạo điểm kiểm tra năng lực.</li><li>Hoàn thành sẽ ghi XP và badge vào Proof Vault.</li></ul><p class="hint">Phù hợp khi bạn muốn hành động và bằng chứng thật.</p>`;
}
function choosePath(path) {
  const project = activeProject(); if (!project) return; project.arenaPath = path; saveState();
  const top = currentRun?.results?.find((r) => r.score >= .58)?.item;
  if (top) openModule(top, path); else brewCurrentTopic();
  toast(path === "merged" ? "Đã merge Coach × Quest." : `Đã chọn lộ trình ${path === "coach" ? "AI Coach" : "Quest Engine"}.`);
}
async function brewCurrentTopic() {
  const project = activeProject(); if (!project) return;
  document.getElementById("pipeline").hidden = false; document.getElementById("pipeline-title").textContent = "Brew Your Topic — đang ủ module từ input của bạn…";
  for (let i = 0; i < AGENTS.length; i++) { setPipeline(i); await wait(55); }
  setPipeline(AGENTS.length, true);
  const module = createBrewModule(project.topic || project.title, { keywords: project.keywords, sourceCount: project.sources.length });
  openModule(module, "brew");
}
function openModule(module, origin = "search") {
  const project = activeProject(); if (!project || !module) return;
  const isNew = project.module?.id !== module.id;
  project.module = clone(module); project.status = "learning"; project.updatedAt = new Date().toISOString();
  if (isNew) { project.completedQuestIds = []; project.quiz = null; project.reorderPassed = false; project.badge = null; }
  saveState(); renderAll(); renderModule();
  document.getElementById("module-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  if (isNew) toast(origin === "brew" ? "Module Brew đã sẵn sàng (demo local)." : "Đã mở module học tập.");
}
function moduleProgress(project) {
  if (!project?.module) return 0; const questRatio = project.completedQuestIds.length / Math.max(1, project.module.quests.length);
  const quizRatio = project.quiz ? project.quiz.score / project.module.quiz.length : 0; const reorder = project.reorderPassed ? 1 : 0;
  return Math.round((questRatio * .55 + quizRatio * .3 + reorder * .15) * 100);
}
function renderModule() {
  const project = activeProject(); const panel = document.getElementById("module-panel"); const content = document.getElementById("module-content");
  if (!project?.module) { panel.hidden = true; return; }
  const m = project.module; const progress = moduleProgress(project);
  panel.hidden = false;
  content.innerHTML = `
    <div class="module-hero"><div><p class="eyebrow ${m.generated ? "gold" : ""}">${m.generated ? "BREWED MODULE · DEMO" : "GON LEARNING MODULE"} · ${esc(project.arenaPath || "CHƯA CHỌN PATH")}</p>
      <h2>${esc(m.icon)} ${esc(m.title)}</h2><p>${esc(m.summary)}</p><div class="meta-row"><span>${esc(m.difficulty)}</span><span>~${m.minutes} phút</span><span>${m.xp} XP tối đa</span>${m.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</div></div>
      <div class="module-score"><span>TIẾN ĐỘ</span><strong>${progress}%</strong><small>${project.completedQuestIds.length}/${m.quests.length} quest</small></div></div>
    <div class="progress-line"><i style="width:${progress}%"></i></div>
    <div class="tabs" role="tablist">
      ${["learn|📚 Học", "quests|⚔ Quest", "challenge|🧠 Thử thách", "proof|⬡ Bằng chứng"].map((x, i) => { const [id, label] = x.split("|"); return `<button type="button" class="tab-btn ${i === 0 ? "active" : ""}" data-tab="${id}" role="tab">${label}</button>`; }).join("")}
    </div>
    <section class="tab-page active" data-page="learn">
      <div class="learn-grid">${m.concepts.map((c) => `<article class="learn-card"><small class="eyebrow">CONCEPT</small><h3>${esc(c.name)}</h3><p>${esc(c.detail)}</p></article>`).join("")}</div>
      <h3>Flashcards — bấm để lật</h3><div class="flash-grid">${m.flashcards.map((f) => `<button type="button" class="flash-card"><small>FLASHCARD</small><strong>${esc(f.front)}</strong><p>${esc(f.back)}</p><span class="hint">Bấm để hiện/ẩn đáp án</span></button>`).join("")}</div>
      <h3>Outcome sau module</h3><ul>${m.outcomes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      ${m.generated ? `<div class="proof-callout"><strong>Minh bạch AI:</strong> Đây là module demo sinh cục bộ từ khung sư phạm, chưa được nghiên cứu web hay kiểm chứng từng câu. Production ADK phải gắn nguồn, trạng thái grounding và bước duyệt trước khi xuất bản.</div>` : ""}
    </section>
    <section class="tab-page" data-page="quests"><div class="quest-list">
      ${m.quests.map((q) => `<article class="quest-card ${project.completedQuestIds.includes(q.id) ? "done" : ""}"><input class="quest-check" type="checkbox" data-quest="${esc(q.id)}" ${project.completedQuestIds.includes(q.id) ? "checked" : ""} aria-label="Hoàn thành ${esc(q.title)}"><div><h3>${esc(q.title)}</h3><p>${esc(q.detail)}</p></div><span class="quest-xp">+${q.xp} XP</span></article>`).join("")}
    </div></section>
    <section class="tab-page" data-page="challenge">
      <form id="quiz-form"><h3>Kiểm tra truy hồi</h3>${m.quiz.map((q, qi) => `<fieldset class="quiz-q"><legend>${qi + 1}. ${esc(q.q)}</legend>${q.options.map((op, oi) => `<label class="quiz-opt"><input type="radio" name="q${qi}" value="${oi}" ${project.quiz?.answers?.[qi] === oi ? "checked" : ""}><span>${esc(op)}</span></label>`).join("")}<div class="answer-note" id="note-${qi}"></div></fieldset>`).join("")}<button class="primary-btn" type="submit">Chấm quiz</button> <span id="quiz-result" class="hint">${project.quiz ? `Lần gần nhất: ${project.quiz.score}/${m.quiz.length}` : ""}</span></form>
      <h3>Reorder — sắp xếp lộ trình học đúng</h3><div id="reorder-list" class="reorder-list"></div><p><button id="check-reorder" class="secondary-btn" type="button">Kiểm tra thứ tự</button> <span id="reorder-result" class="hint">${project.reorderPassed ? "Đã hoàn thành." : "Dùng nút ↑ ↓ để sắp xếp."}</span></p>
    </section>
    <section class="tab-page" data-page="proof">
      <div class="proof-callout"><strong>Boss Proof:</strong> ${esc(m.realWorld || "Tạo một sản phẩm hoặc hành động thật, sau đó nộp vào Proof Vault với nguồn có thể truy vết.")}</div>
      <h3>Nguồn input đã gắn vào dự án</h3><div class="source-list">${project.sources.map((s) => `<div class="source-item"><span><strong>${esc(sourceLabel(s))}:</strong> ${esc(s.title)}<br><small>${esc(s.detail || s.url || "")}</small></span>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Mở ↗</a>` : ""}</div>`).join("") || `<div class="empty">Chưa có nguồn.</div>`}</div>
      <p><button id="go-proof" class="secondary-btn" type="button">＋ Thêm proof cho dự án này</button> <button id="complete-module" class="gold-btn" type="button" ${project.badge ? "disabled" : ""}>${project.badge ? "✓ Đã nhận GON Badge" : "Hoàn thành & ghi GON Badge"}</button></p>
      <p class="hint">Điều kiện demo: đạt tối thiểu 60% tiến độ tổng. Badge prototype là “system-recorded”, chưa phải POAP on-chain.</p>
    </section>`;
  content.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => {
    content.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    content.querySelectorAll("[data-page]").forEach((p) => p.classList.toggle("active", p.dataset.page === btn.dataset.tab));
  }));
  content.querySelectorAll(".flash-card").forEach((card) => card.addEventListener("click", () => card.classList.toggle("flipped")));
  content.querySelectorAll("[data-quest]").forEach((box) => box.addEventListener("change", () => toggleQuest(project, box.dataset.quest, box.checked)));
  renderReorder(project);
  document.getElementById("quiz-form")?.addEventListener("submit", (e) => gradeQuiz(e, project));
  document.getElementById("check-reorder")?.addEventListener("click", () => checkReorder(project));
  document.getElementById("go-proof")?.addEventListener("click", () => { showView("proofs"); document.getElementById("proof-project").value = project.id; document.getElementById("proof-title-input").focus(); });
  document.getElementById("complete-module")?.addEventListener("click", () => completeModule(project));
}
function toggleQuest(project, questId, checked) {
  const quest = project.module.quests.find((q) => q.id === questId); if (!quest) return;
  if (checked && !project.completedQuestIds.includes(questId)) { project.completedQuestIds.push(questId); saveState(); addXP(quest.xp, quest.title, `Hoàn thành trong dự án “${project.title}”.`, project.id, "⚔"); }
  if (!checked && project.completedQuestIds.includes(questId)) { project.completedQuestIds = project.completedQuestIds.filter((id) => id !== questId); state.xp = Math.max(0, state.xp - quest.xp); saveState(); toast("Đã bỏ đánh dấu quest; XP tương ứng được hoàn lại khỏi tổng."); }
  renderAll(); renderModule();
}
function gradeQuiz(event, project) {
  event.preventDefault(); const answers = project.module.quiz.map((_, i) => { const chosen = document.querySelector(`input[name="q${i}"]:checked`); return chosen ? Number(chosen.value) : -1; });
  let score = 0; project.module.quiz.forEach((q, i) => { const good = answers[i] === q.answer; if (good) score++; const note = document.getElementById(`note-${i}`); note.className = `answer-note ${good ? "good" : "bad"}`; note.textContent = good ? `✓ Đúng. ${q.why}` : `✕ Chưa đúng. Đáp án: ${q.options[q.answer]}. ${q.why}`; });
  const firstPass = !project.quiz?.awarded && score >= 2; project.quiz = { answers, score, awarded: project.quiz?.awarded || firstPass, at: new Date().toISOString() }; saveState();
  document.getElementById("quiz-result").textContent = `Kết quả: ${score}/${project.module.quiz.length}`;
  if (firstPass) addXP(60, "Vượt qua kiểm tra truy hồi", `Đạt ${score}/${project.module.quiz.length} trong “${project.module.title}”.`, project.id, "🧠"); else { renderAll(); toast(`Quiz: ${score}/${project.module.quiz.length}. Hãy xem giải thích và thử lại.`); }
}
function renderReorder(project) {
  const wrap = document.getElementById("reorder-list"); if (!wrap) return;
  if (!project.reorderState) project.reorderState = [...project.module.reorder].sort((a, b) => hashSeed(a + project.id) - hashSeed(b + project.id));
  wrap.innerHTML = project.reorderState.map((item, i) => `<div class="reorder-item"><span><strong>${i + 1}.</strong> ${esc(item)}</span><span><button type="button" data-move="-1" data-index="${i}" aria-label="Lên">↑</button> <button type="button" data-move="1" data-index="${i}" aria-label="Xuống">↓</button></span></div>`).join("");
  wrap.querySelectorAll("[data-move]").forEach((btn) => btn.addEventListener("click", () => { const i = Number(btn.dataset.index), j = i + Number(btn.dataset.move); if (j < 0 || j >= project.reorderState.length) return;[project.reorderState[i], project.reorderState[j]] = [project.reorderState[j], project.reorderState[i]]; saveState(); renderReorder(project); }));
}
function checkReorder(project) {
  const ok = JSON.stringify(project.reorderState) === JSON.stringify(project.module.reorder);
  const el = document.getElementById("reorder-result"); el.textContent = ok ? "Chính xác — lộ trình đã đúng thứ tự." : "Chưa đúng. Hãy nghĩ: mục tiêu trước, bằng chứng sau thực hành.";
  if (ok && !project.reorderPassed) { project.reorderPassed = true; saveState(); addXP(40, "Hoàn thành Reorder", `Sắp xếp đúng lộ trình trong “${project.module.title}”.`, project.id, "🧩"); renderModule(); }
}
function completeModule(project) {
  const progress = moduleProgress(project);
  if (progress < 60) { toast(`Tiến độ hiện ${progress}%. Cần tối thiểu 60% để ghi badge demo.`); return; }
  if (project.badge) return;
  const badge = { id: uid("badge"), name: `GON Hero Badge · ${project.module.title}`, hash: localHash(`${project.id}-${project.module.id}-${Date.now()}`), issuedAt: new Date().toISOString(), standard: "GON demo record · POAP-ready metadata, not minted" };
  project.badge = badge; project.status = "completed";
  state.proofs.unshift({ id: uid("proof"), type: "artifact", title: badge.name, url: "", issuer: "GON prototype system", projectId: project.id, notes: `Hoàn thành module với tiến độ ${progress}%. Chuẩn metadata: ${badge.standard}.`, status: "System-recorded", level: 2, hash: badge.hash, isPublic: false, createdAt: badge.issuedAt });
  saveState(); addXP(100, "Nhận GON Hero Badge", `Hoàn thành “${project.module.title}”.`, project.id, "♛"); renderModule();
}

/* ---------------- Rendering ---------------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  document.querySelectorAll("[data-view-link]").forEach((b) => { if (b.classList.contains("nav-item")) b.classList.toggle("active", b.dataset.viewLink === name); });
  document.getElementById("sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderProjects() {
  const list = document.getElementById("project-list");
  const projects = state.projects.filter((p) => !projectFilter || normalizeText(`${p.title} ${p.keywords.join(" ")}`).includes(normalizeText(projectFilter)));
  list.innerHTML = projects.map((p) => `<button type="button" class="project-btn ${p.id === state.activeProjectId ? "active" : ""}" data-project="${esc(p.id)}"><strong>${esc(p.title)}</strong><small><span>${esc(p.status)}</span><span>${moduleProgress(p)}%</span></small></button>`).join("") || `<div class="empty">Không có dự án khớp bộ lọc.</div>`;
  list.querySelectorAll("[data-project]").forEach((btn) => btn.addEventListener("click", () => { state.activeProjectId = btn.dataset.project; saveState(); renderAll(); if (activeProject()?.module) renderModule(); showView("arena"); }));
  const select = document.getElementById("proof-project"); const old = select.value;
  select.innerHTML = `<option value="">Không gắn dự án</option>` + state.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join(""); select.value = old || state.activeProjectId || "";
}
function renderLevels() {
  const info = calculateLevel(state.xp);
  document.getElementById("level-name").textContent = info.current.name; document.getElementById("xp-value").textContent = `${state.xp} XP`; document.getElementById("xp-bar").style.width = `${Math.round(info.progress * 100)}%`;
  document.getElementById("next-level-label").textContent = info.next ? `${info.remaining} XP → ${info.next.name}` : "Forever";
  const html = LEVELS.map((level, i) => `<div class="level-step ${state.xp >= level.xp ? "done" : ""} ${info.current.key === level.key ? "current" : ""}"><i>${state.xp >= level.xp ? "✓" : i + 1}</i><span><strong>${level.icon} ${level.name}</strong><br><small>${level.xp} XP · ${level.note}</small></span></div>`).join("");
  document.getElementById("level-track").innerHTML = html;
  document.getElementById("journey-levels").innerHTML = LEVELS.map((level) => `<div class="journey-node ${state.xp >= level.xp ? "done" : ""} ${info.current.key === level.key ? "current" : ""}"><i>${level.icon}</i><strong>${level.name}</strong><br>${level.xp} XP</div>`).join("");
  document.getElementById("journey-next").textContent = info.next ? `Còn ${info.remaining} XP để lên ${info.next.name}` : "Đã chạm Forever — hành trình vẫn tiếp tục";
}
function renderProfile() {
  const user = state.user || { name: "Hero Demo", email: "Google demo" };
  document.getElementById("profile-name").textContent = user.name; document.getElementById("profile-email").textContent = `${user.email} · 18+ self-declared`;
  const initial = (user.name.trim()[0] || "H").toUpperCase(); document.getElementById("profile-avatar").textContent = initial; document.getElementById("avatar-initial").textContent = initial;
  document.getElementById("stat-projects").textContent = state.projects.length; document.getElementById("stat-proofs").textContent = state.proofs.length;
  document.getElementById("stat-badges").textContent = state.projects.filter((p) => p.badge).length; document.getElementById("proof-count").textContent = state.proofs.length;
  const active = activeProject(); document.getElementById("active-project").innerHTML = active ? `<strong>${esc(active.title)}</strong><p class="hint">${esc(active.module?.title || "Chưa chọn module")} · ${moduleProgress(active)}%</p><div class="progress-line"><i style="width:${moduleProgress(active)}%"></i></div>` : `<div class="empty">Chưa có dự án.</div>`;
  const badges = state.projects.filter((p) => p.badge).slice(0, 3);
  document.getElementById("recent-badges").innerHTML = badges.map((p) => `<div class="badge-mini"><span class="badge-orb">G</span><span><strong>${esc(p.badge.name)}</strong><br><small class="muted">${fmtDate(p.badge.issuedAt)} · ${esc(p.badge.hash)}</small></span></div>`).join("") || `<p class="hint">Chưa có badge. Hoàn thành 60% một module để ghi badge demo đầu tiên.</p>`;
  renderDailyQuest();
}
function dailyQuestForToday() {
  const quests = [
    "Tóm tắt một nguồn học tập trong 5 câu và gắn vào dự án đang mở.",
    "Hoàn thành một flashcard khó nhất mà không nhìn đáp án trước.",
    "Tìm một nguồn độc lập để kiểm chứng khẳng định quan trọng nhất hôm nay.",
    "Đi bộ 10 phút không điện thoại và ghi lại một ý tưởng học tập.",
    "Biến một ghi chú thành bằng chứng: ảnh, link hoặc sản phẩm nhỏ.",
    "Chia sẻ một điều tử tế bạn học được với cộng đồng (không lộ dữ liệu riêng tư).",
    "Phản tư 5 phút: điều gì khiến bạn tiến gần Hero hơn hôm qua?"
  ];
  const day = Math.floor(Date.now() / 86400000); return quests[day % quests.length];
}
function renderDailyQuest() {
  const key = new Date().toISOString().slice(0, 10); const done = !!state.daily[key];
  const el = document.getElementById("daily-quest");
  el.innerHTML = `<label class="daily-item"><input id="daily-check" type="checkbox" ${done ? "checked disabled" : ""}><span>${esc(dailyQuestForToday())}<br><small class="muted">${done ? "Đã nhận XP hôm nay." : "Tự khai hoàn thành — bằng chứng mạnh hơn nếu gắn artifact."}</small></span></label>`;
  document.getElementById("daily-check")?.addEventListener("change", (e) => { if (!e.target.checked || state.daily[key]) return; state.daily[key] = true; saveState(); addXP(30, "Hoàn thành Daily Quest", dailyQuestForToday(), state.activeProjectId, "☀"); });
}
function renderJourney() {
  const completed = state.projects.filter((p) => p.status === "completed").length;
  const verified = state.proofs.filter((p) => p.level >= 2).length;
  const skills = new Map();
  for (const p of state.projects) for (const s of p.module?.skills || p.keywords || []) skills.set(s, (skills.get(s) || 0) + 1 + Math.round(moduleProgress(p) / 50));
  document.getElementById("journey-stats").innerHTML = [[state.xp, "Tổng XP"], [state.projects.length, "Dự án học tập"], [completed, "Module hoàn thành"], [verified, "Proof từ cấp System-recorded"]].map(([n, label]) => `<div class="stat-card"><strong>${n}</strong><span>${label}</span></div>`).join("");
  document.getElementById("timeline").innerHTML = state.events.slice(0, 30).map((e) => `<div class="event"><i>${esc(e.icon || "✦")}</i><div><strong>${esc(e.title)}</strong><p>${esc(e.detail)} · +${e.xp || 0} XP</p></div><time>${fmtDate(e.createdAt)}</time></div>`).join("") || `<div class="empty">Chưa có sự kiện.</div>`;
  document.getElementById("skill-tree").innerHTML = [...skills.entries()].sort((a, b) => b[1] - a[1]).map(([skill, pts]) => `<div class="skill-row"><span><strong>${esc(skill)}</strong><br><small>Cường độ bằng chứng/tiến độ</small></span><b>${pts}</b></div>`).join("") || `<div class="empty">Kỹ năng sẽ xuất hiện sau dự án đầu tiên.</div>`;
}
function proofTypeLabel(type) { return { poap: "POAP / SBT", certificate: "Chứng chỉ", youtube: "YouTube", facebook: "Facebook", artifact: "Sản phẩm", source: "Nguồn học", reflection: "Phản tư" }[type] || type; }
function renderProofs() {
  document.getElementById("verification-legend").innerHTML = VERIFICATION_LEVELS.map((v) => `<div class="verify-row"><i>${v.icon}</i><div><strong>L${v.level} · ${v.name}</strong><p>${v.description}</p></div></div>`).join("");
  const list = document.getElementById("proof-list");
  list.innerHTML = state.proofs.map((p) => { const project = state.projects.find((x) => x.id === p.projectId); const v = VERIFICATION_LEVELS[p.level] || VERIFICATION_LEVELS[0]; return `<article class="proof-card">
    <div class="meta-row"><span>${esc(proofTypeLabel(p.type))}</span><span>L${p.level} · ${esc(v.name)}</span><span>${p.isPublic ? "Public" : "Private"}</span></div>
    <h3>${esc(p.title)}</h3><p>${esc(p.notes || "Không có ghi chú.")}</p>${p.image ? `<img src="${esc(p.image)}" alt="Ảnh bằng chứng ${esc(p.title)}">` : ""}
    <p><small>Issuer/nguồn: ${esc(p.issuer || "Chưa ghi")} · Dự án: ${esc(project?.title || "Chưa gắn")} · ${fmtDate(p.createdAt)}</small></p>
    ${p.hash ? `<p class="hash">${esc(p.hash)}</p>` : ""}
    <div class="proof-foot">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Mở bằng chứng ↗</a>` : "<span></span>"}<button class="tool-btn danger" data-delete-proof="${esc(p.id)}" type="button">Xóa</button></div></article>`; }).join("") || `<div class="empty">Proof Vault đang trống.</div>`;
  list.querySelectorAll("[data-delete-proof]").forEach((btn) => btn.addEventListener("click", () => { state.proofs = state.proofs.filter((p) => p.id !== btn.dataset.deleteProof); saveState(); renderAll(); toast("Đã xóa bằng chứng khỏi prototype local."); }));
}
function renderSuggestions() {
  const suggestions = [["🩸", "Hiến máu & Guardian", "hiến máu an toàn sức khỏe cộng đồng proof", "Sức khỏe nhân văn"], ["🧭", "Vector Search 768D", "vector embeddings 768 semantic search cosine", "AI & Search"], ["⬡", "POAP Proof", "POAP proof of humanity bằng chứng học tập", "Trust"], ["✦", "Chủ đề chưa từng có", "thiết kế nghi lễ học tập cho phi hành gia Việt Nam trên trạm mặt trăng", "Kích hoạt Brew"]];
  document.getElementById("suggestions").innerHTML = suggestions.map(([icon, title, query, tag]) => `<button class="suggestion" type="button" data-suggestion="${esc(query)}"><span>${icon}</span><strong>${title}</strong><small>${tag} · bấm để điền prompt</small></button>`).join("");
  document.querySelectorAll("[data-suggestion]").forEach((b) => b.addEventListener("click", () => { document.getElementById("prompt").value = b.dataset.suggestion; document.getElementById("prompt").focus(); }));
}
function renderSystem() {
  document.getElementById("system-flow").innerHTML = FLOW.map(([icon, title, detail]) => `<div class="flow-step"><span>${icon}</span><strong>${title}</strong><p>${detail}</p></div>`).join("");
  document.getElementById("agent-grid").innerHTML = AGENTS.map(([name, detail], i) => `<div class="agent-card"><b>${String(i + 1).padStart(2, "0")}</b><h3>${name}</h3><p>${detail}</p></div>`).join("");
  document.getElementById("integration-table").innerHTML = INTEGRATIONS.map(([name, status, detail]) => `<div class="integration-row"><strong>${name}</strong><span class="status-pill ${status.includes("Demo") || status.includes("Local") ? "gold" : ""}">${status}</span><span class="muted">${detail}</span></div>`).join("");
}
function renderAll() { renderProfile(); renderLevels(); renderProjects(); renderJourney(); renderProofs(); }

/* ---------------- Proof form ---------------- */
async function handleProofFile(file) {
  if (!file) { pendingProofFile = null; document.getElementById("proof-preview").innerHTML = ""; return; }
  const hash = await sha256(file); pendingProofFile = { name: file.name, mime: file.type, size: file.size, hash, image: "" };
  if (file.type.startsWith("image/")) pendingProofFile.image = await fileToDataURL(file, 760);
  document.getElementById("proof-preview").innerHTML = `${pendingProofFile.image ? `<img src="${esc(pendingProofFile.image)}" alt="Xem trước proof">` : ""}<p class="hint"><strong>${esc(file.name)}</strong> · ${(file.size / 1024).toFixed(1)} KB<br><span class="hash">${esc(hash)}</span></p>`;
}
function proofVerification(type, url, issuer, hasFile) {
  const info = url ? classifyUrl(url) : null;
  if (type === "poap" && url && issuer) return { level: 1, status: "Source-linked · chờ issuer/on-chain check" };
  if (hasFile) return { level: 1, status: "Hash-anchored locally · chờ issuer check" };
  if (info?.ok) return { level: 1, status: "Source-linked · chưa xác minh chủ sở hữu" };
  return { level: 0, status: "Self-declared" };
}
function submitProof(event) {
  event.preventDefault();
  const type = document.getElementById("proof-type").value; const title = document.getElementById("proof-title-input").value.trim(); const url = document.getElementById("proof-url").value.trim(); const issuer = document.getElementById("proof-issuer").value.trim();
  const verification = proofVerification(type, url, issuer, !!pendingProofFile);
  const proof = { id: uid("proof"), type, title, url, issuer, projectId: document.getElementById("proof-project").value, notes: document.getElementById("proof-notes").value.trim(), status: verification.status, level: verification.level, hash: pendingProofFile?.hash || (url ? localHash(url) : ""), image: pendingProofFile?.image || "", isPublic: document.getElementById("proof-public").checked, createdAt: new Date().toISOString() };
  state.proofs.unshift(proof); saveState(); pendingProofFile = null; event.target.reset(); document.getElementById("proof-preview").innerHTML = "";
  addXP(20, "Thêm bằng chứng học tập", `${title} · ${verification.status}.`, proof.projectId || state.activeProjectId, "⬡"); renderProofs();
}

/* ---------------- Export ---------------- */
function download(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function journeyMarkdown() {
  const level = calculateLevel(state.xp).current;
  return `# GON Hero Journey — ${state.user?.name || "Hero Demo"}\n\n- Level: ${level.icon} ${level.name}\n- XP: ${state.xp}\n- Exported: ${new Date().toISOString()}\n\n## Projects\n${state.projects.map((p) => `\n### ${p.title}\n- Status: ${p.status}\n- Progress: ${moduleProgress(p)}%\n- Module: ${p.module?.title || "—"}\n- Keywords: ${(p.keywords || []).join(", ")}\n- Sources: ${p.sources.map((s) => s.title).join("; ") || "—"}`).join("\n")}\n\n## Proof Vault\n${state.proofs.map((p) => `- [L${p.level}] **${p.title}** (${proofTypeLabel(p.type)}) — ${p.status}${p.url ? ` — ${p.url}` : ""}${p.hash ? `\n  - Hash: \`${p.hash}\`` : ""}`).join("\n")}\n\n> GON prototype export. Verification levels are transparent labels, not issuer certification.\n`;
}

/* ---------------- Init ---------------- */
function init() {
  renderSuggestions(); renderSystem(); renderSources();
  if (state.user) { document.getElementById("gate").hidden = true; document.getElementById("app").hidden = false; }
  renderAll(); if (activeProject()?.module) renderModule();

  document.getElementById("gate-form").addEventListener("submit", (e) => { e.preventDefault(); enterApp(document.getElementById("gate-name").value, document.getElementById("gate-email").value); });
  document.getElementById("demo-enter").addEventListener("click", () => enterApp("Hero Demo", "hero.demo@gon.org"));
  document.getElementById("sign-out").addEventListener("click", signOut);
  document.getElementById("mobile-menu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
  document.querySelectorAll("[data-view-link]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); showView(el.dataset.viewLink); }));
  document.getElementById("new-project").addEventListener("click", () => { showView("arena"); document.getElementById("prompt").value = ""; pendingSources = []; renderSources(); document.getElementById("pipeline").hidden = true; document.getElementById("results").hidden = true; document.getElementById("arena-compare").hidden = true; document.getElementById("prompt").focus(); });
  document.getElementById("reset-demo").addEventListener("click", () => { const user = state.user; state = defaultState(); state.user = user; pendingSources = []; saveState(); renderAll(); renderSources(); if (activeProject()?.module) renderModule(); toast("Đã reset dữ liệu demo trên trình duyệt này."); });
  document.getElementById("project-search").addEventListener("input", (e) => { projectFilter = e.target.value; renderProjects(); });
  document.getElementById("composer").addEventListener("submit", analyzeInput);
  document.getElementById("prompt").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") document.getElementById("composer").requestSubmit(); });
  document.getElementById("prompt").addEventListener("paste", () => setTimeout(() => { for (const url of extractUrls(document.getElementById("prompt").value)) addUrlSource(url); }, 0));
  const fileInput = document.getElementById("file-input");
  document.getElementById("attach-file").addEventListener("click", () => { fileInput.accept = ".txt,.md,.json,.csv,.html,.xml,.srt,.pdf,image/*,video/*"; fileInput.click(); });
  document.getElementById("attach-image").addEventListener("click", () => { fileInput.accept = "image/*"; fileInput.click(); });
  fileInput.addEventListener("change", () => { if (fileInput.files.length) processFiles(fileInput.files); fileInput.value = ""; });
  const drop = document.getElementById("drop-zone");
  ["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files); const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"); for (const url of extractUrls(text)) addUrlSource(url); });
  drop.addEventListener("click", () => fileInput.click());
  document.getElementById("clear-input").addEventListener("click", () => { document.getElementById("prompt").value = ""; pendingSources = []; renderSources(); });
  const dialog = document.getElementById("url-dialog");
  document.getElementById("add-url").addEventListener("click", () => dialog.showModal());
  document.getElementById("url-save").addEventListener("click", (e) => { const input = document.getElementById("url-input"); if (!input.value || !addUrlSource(input.value, document.getElementById("url-title").value)) { e.preventDefault(); return; } input.value = ""; document.getElementById("url-title").value = ""; });
  document.getElementById("brew-btn").addEventListener("click", brewCurrentTopic);
  document.querySelectorAll(".path-btn").forEach((btn) => btn.addEventListener("click", () => choosePath(btn.dataset.path)));
  document.getElementById("merge-path").addEventListener("click", () => choosePath("merged"));
  document.getElementById("proof-file").addEventListener("change", (e) => handleProofFile(e.target.files[0]));
  document.getElementById("proof-form").addEventListener("submit", submitProof);
  document.getElementById("export-json").addEventListener("click", () => download("gon-hero-journey.json", JSON.stringify({ exportedAt: new Date().toISOString(), version: "gon-prototype-2.0", state }, null, 2), "application/json"));
  document.getElementById("export-md").addEventListener("click", () => download("gon-hero-journey.md", journeyMarkdown(), "text/markdown"));
}
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
if (typeof module !== "undefined" && module.exports) module.exports = { EMBEDDING_DIMENSIONS, LEVELS, CORPUS, normalizeText, tokenize, detectConcepts, createEmbedding768, cosineSimilarity, extractKeywords, classifyUrl, calculateLevel, searchCorpus, createBrewModule, cleanTitle };
