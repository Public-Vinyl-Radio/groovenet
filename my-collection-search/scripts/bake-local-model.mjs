/** Build-time only. Runtime providers categorically disallow remote models. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  LOCAL_MODEL_PATH,
  LOCAL_MODEL_REPO,
  LOCAL_MODEL_REVISION,
} from "../src/lib/embeddings/localModel.ts";

const destination = process.argv[2] ?? LOCAL_MODEL_PATH;
for (const file of [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "onnx/model_quantized.onnx",
]) {
  const response = await fetch(
    `https://huggingface.co/${LOCAL_MODEL_REPO}/resolve/${LOCAL_MODEL_REVISION}/${file}`,
  );
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const path = join(destination, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  console.log(`Baked ${file}`);
}
