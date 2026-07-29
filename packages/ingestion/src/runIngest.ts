// รัน: bun run src/runIngest.ts <year> <month>
import { ingestOcsKrisdikaMonth } from "./ingestOcsKrisdika";

async function main() {
  const year = process.argv[2];
  const month = process.argv[3];
  if (!year || !month) {
    console.error("usage: bun run src/runIngest.ts <year> <month>");
    process.exit(1);
  }

  console.log(`กำลัง ingest ${year}-${month} ...`);
  const start = Date.now();
  const result = await ingestOcsKrisdikaMonth(year, month);
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nเสร็จใน ${seconds}s`);
  console.log(result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
