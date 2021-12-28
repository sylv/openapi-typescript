import { readFileSync, writeFileSync } from "fs";
import { compile } from "json-schema-to-typescript";
import { OpenAPIV3 } from "openapi-types";
import path from "path";
import prettier from "prettier";
import { Project, SourceFile } from "ts-morph";
import { performance } from "perf_hooks";

const inputPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3]);

const template = readFileSync(path.resolve(__dirname, "template.ts"), "utf8");
const schemaContent = readFileSync(inputPath, "utf8");
const document: OpenAPIV3.Document = JSON.parse(schemaContent);
const refNameRegex = /^#\/components\/schemas\/(?<name>[A-z]+)$/;
const refStringRegex = /"__ref:(?<name>[A-z]+)";/g;
const interfaceNameRegex = /interface (?<name>[A-z]+) {/i;

function getRefType(input: any): string | undefined {
  if (!input) return;
  if (input.type === "array") {
    const ref = getRefType(input.items);
    if (ref) return `${ref}[]`;
  }

  if (!("$ref" in input)) return;
  if (typeof input.$ref !== "string") return;
  return refNameRegex.exec(input.$ref)?.groups?.name;
}

// super hacky way to fix references, otherwise it just
// redefines the object every time and i cba figuring out
// how to stop it doing that.
// https://github.com/bcherny/json-schema-to-typescript/issues/258
function formatReferences(input: any): void {
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "object" && value !== null) {
      const refName = getRefType(value);
      if (refName) {
        input[key] = {
          oneOf: [`__ref:${refName}`],
        };
      } else {
        formatReferences(value);
      }
    }
  }
}

function cleanReferences(input: string): string {
  return input.replace(refStringRegex, (match, name) => `${name};`);
}

async function compileSchema(
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
  name: string
): Promise<{ name: string; content: string }> {
  formatReferences(schema);
  const compiled = await compile(schema, name, {
    bannerComment: "",
  });

  const generatedName = interfaceNameRegex.exec(compiled)!.groups!.name;
  return {
    name: generatedName,
    content: cleanReferences(compiled),
  };
}

async function addRoutesInterface(file: SourceFile, document: OpenAPIV3.Document): Promise<void> {
  const interfaceKeys: Array<[string, string]> = [];
  for (const [path, methods] of Object.entries(document.paths)) {
    const method = methods?.get;
    const okResponse = method?.responses["200"] as OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject | undefined;

    if (!method || !method.operationId || !okResponse || !("content" in okResponse)) continue;
    const body = okResponse.content?.["application/json"];
    if (!body || !body.schema) continue;
    const refName = getRefType(body.schema);
    if (!refName) {
      const compiled = await compileSchema(body.schema, `${method.operationId}Response`);
      file.insertStatements(-1, "\n" + compiled.content);
      interfaceKeys.push([path, compiled.name]);
    } else {
      interfaceKeys.push([path, refName]);
    }
  }

  file.addInterface({
    name: "Routes",
    isExported: true,
    properties: interfaceKeys.map(([name, type]) => ({
      name: `'${name}'`,
      type: type,
    })),
  });
}

async function createInterfaces(document: OpenAPIV3.Document): Promise<string> {
  let generated = ``;
  for (const [name, schema] of Object.entries(document.components!.schemas!)) {
    const input = Object.assign({}, schema, { components: document.components });
    const compiled = await compileSchema(input, name);
    generated += compiled.content + "\n";
  }

  return cleanReferences(generated);
}

async function formatOutput(): Promise<void> {
  const config = await prettier.resolveConfig(outputPath);
  const file = readFileSync(outputPath, "utf8");
  const formatted = prettier.format(file, {
    ...config,
    parser: "typescript",
  });

  writeFileSync(outputPath, formatted);
}

async function main(): Promise<void> {
  const start = performance.now();
  if (!document.components?.schemas) {
    throw new Error("No schemas found");
  }

  const project = new Project();
  const interfaces = await createInterfaces(document);
  const file = project.createSourceFile(outputPath, interfaces, { overwrite: true });

  await addRoutesInterface(file, document);

  // these lines are backwards, the one at the top ends up being the last line at the top of the file
  file.insertStatements(0, "/* eslint-disable */\n\n");
  file.insertStatements(0, "/* eslint-disable unicorn/no-abusive-eslint-disable */");
  file.insertStatements(0, "// Do not edit it directly.\n\n");
  file.insertStatements(0, "// This file is generated automatically.");

  // add the template contents to the end of the file
  file.insertStatements(-1, "\n" + template);

  await project.save();
  await formatOutput();
  const duration = (performance.now() - start).toFixed(2);
  console.log(`✨ Successfully generated ${outputPath} in ${duration}ms`);
}

main();
