// npm run export-db -> database/schema.json (collections, fields, types, constraints)
//                      database/sample_data/<collection>.json (import with mongoimport --jsonArray)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../db.js';
import { ALL_MODELS } from '../models.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database');

function describe(model) {
  const fields = {};
  model.schema.eachPath((p, t) => {
    if (p === '__v') return;
    const o = t.options || {};
    const f = { type: t.instance === 'ObjectId' ? 'ObjectId' : t.instance };
    if (t.caster) f.items = t.caster.instance;
    const ref = o.ref || t.caster?.options?.ref;
    if (ref) f.ref = ALL_MODELS.find((m) => m.modelName === ref)?.collection.collectionName || ref;
    if (o.required) f.required = true;
    if (o.unique) f.unique = true;
    if (o.enum) f.enum = o.enum;
    if (o.min !== undefined) f.min = o.min;
    if (o.max !== undefined) f.max = o.max;
    if (o.match) f.pattern = String(o.match);
    if (o.default !== undefined && typeof o.default !== 'function') f.default = o.default;
    fields[p] = f;
  });
  return fields;
}

await connectDB();
fs.mkdirSync(path.join(OUT, 'sample_data'), { recursive: true });
const schema = { database: mongoose.connection.db.databaseName, collections: {} };
for (const M of ALL_MODELS) {
  const name = M.collection.collectionName;
  schema.collections[name] = describe(M);
  const docs = await M.find().lean();
  const ejson = JSON.parse(JSON.stringify(docs, (k, v) => (v instanceof mongoose.Types.ObjectId ? { $oid: String(v) } : v)));
  fs.writeFileSync(path.join(OUT, 'sample_data', `${name}.json`), JSON.stringify(ejson, null, 2));
  console.log(`${name.padEnd(18)} ${docs.length} documents`);
}
fs.writeFileSync(path.join(OUT, 'schema.json'), JSON.stringify(schema, null, 2));
console.log(`Written to ${OUT}`);
await disconnectDB();
