// Skillの同期: .claude/skills(正本・Claude Code用)→ .agents/skills(Codex用コピー)
// Codex は リポジトリの .agents/skills/ からプロジェクトSkillを読み込む。
// 使い方: npm run sync-skills
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, '.claude', 'skills');
const dest = path.join(root, '.agents', 'skills');

if (!fs.existsSync(src)) {
    console.error(`Skillの正本が見つかりません: ${src}`);
    process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });

const skills = fs.readdirSync(dest, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
console.log(`同期完了: ${skills.length}件のSkillを .agents/skills/ へコピーしました`);
for (const name of skills) console.log(`  - ${name}`);
