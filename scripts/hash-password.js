const crypto = require("crypto");

const PASSWORD_HASH_ALGORITHM = "scrypt";
const PASSWORD_HASH_KEY_LENGTH = 64;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const key = crypto.scryptSync(String(password || ""), salt, PASSWORD_HASH_KEY_LENGTH).toString("hex");
  return `${PASSWORD_HASH_ALGORITHM}$${salt}$${key}`;
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  const password = process.argv[2] || process.env.PASSWORD || (await readStdin());
  if (!password) {
    console.error("Usage: npm run hash-password -- <password>");
    console.error("Or pipe a password to: node scripts/hash-password.js");
    process.exit(1);
  }
  console.log(hashPassword(password));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
