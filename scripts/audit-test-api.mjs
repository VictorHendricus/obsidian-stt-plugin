import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const apiPath = path.join(root, "src/testing/plugin-testing-api.ts");
const acceptanceDir = path.join(root, "tests/acceptance");
const apiSelfTestPath = path.join(acceptanceDir, "plugin-testing-api.test.ts");

const sourceText = fs.readFileSync(apiPath, "utf8");
const sourceFile = ts.createSourceFile(apiPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaredApiPaths = collectPluginTestingApiPaths(sourceFile);
const acceptanceFiles = listFiles(acceptanceDir, ".ts");
const acceptanceTextByFile = new Map(acceptanceFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));

const unused = [];
const reviewOnly = [];

for (const apiPathName of declaredApiPaths) {
	const usageFiles = acceptanceFiles.filter((file) => acceptanceTextByFile.get(file)?.includes(`api.${apiPathName}`));

	if (usageFiles.length === 0) {
		unused.push(apiPathName);
		continue;
	}

	if (usageFiles.every((file) => file === apiSelfTestPath)) {
		reviewOnly.push(apiPathName);
	}
}

if (unused.length > 0) {
	console.error("Unused testing API helpers found. Delete them or add a real acceptance scenario that uses them:");
	for (const apiPathName of unused) {
		console.error(`- api.${apiPathName}`);
	}
	process.exitCode = 1;
}

if (reviewOnly.length > 0) {
	console.warn("Testing API helpers used only by plugin-testing-api.test.ts. Review whether they still map to real scenarios:");
	for (const apiPathName of reviewOnly) {
		console.warn(`- api.${apiPathName}`);
	}
}

if (unused.length === 0 && reviewOnly.length === 0) {
	console.log("Testing API audit passed.");
}

function collectPluginTestingApiPaths(file) {
	const interfaceDeclaration = file.statements.find(
		(statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === "PluginTestingApi",
	);
	if (!interfaceDeclaration) {
		throw new Error("Could not find PluginTestingApi interface.");
	}

	return interfaceDeclaration.members.flatMap((member) => collectApiPathsFromMember(member, []));
}

function collectApiPathsFromMember(member, prefix) {
	const name = propertyNameText(member.name);
	if (!name) {
		return [];
	}

	if (ts.isMethodSignature(member)) {
		return [[...prefix, name].join(".")];
	}

	if (!ts.isPropertySignature(member) || !member.type) {
		return [];
	}

	if (ts.isTypeLiteralNode(member.type)) {
		return member.type.members.flatMap((child) => collectApiPathsFromMember(child, [...prefix, name]));
	}

	return [];
}

function propertyNameText(name) {
	if (!name || !ts.isIdentifier(name)) {
		return "";
	}

	return name.text;
}

function listFiles(directory, extension) {
	if (!fs.existsSync(directory)) {
		return [];
	}

	const entries = fs.readdirSync(directory, {withFileTypes: true});
	return entries.flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			return listFiles(entryPath, extension);
		}

		return entry.isFile() && entry.name.endsWith(extension) ? [entryPath] : [];
	});
}
