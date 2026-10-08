/* Test-only AST seam: select complete named declarations from the shipped renderer.
   Module-private functions cannot be imported without booting WebGL and the full DOM.
   This avoids substring boundaries; controlled dependencies remain unit-probe limitations. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const path = new URL('../../src/original-renderer.ts', import.meta.url);
export const rendererSource = readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path.pathname, rendererSource, ts.ScriptTarget.Latest, true);
export function declarations(...names: string[]): string {
  return names.map(name => {
    const statement = ast.statements.find(s =>
      (ts.isFunctionDeclaration(s) && s.name?.text === name) ||
      (ts.isVariableStatement(s) && s.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name)));
    if (!statement) throw new Error(`Missing renderer declaration: ${name}`);
    return statement.getText(ast);
  }).join('\n');
}
export const rendererIcons = ast.statements.flatMap(s => {
  if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) return [];
  const specifier = s.moduleSpecifier.text;
  return specifier.endsWith('.svg?raw')
    ? [{ path: specifier, svg: readFileSync(new URL(specifier.replace(/\?raw$/, ''), path), 'utf8') }]
    : [];
});
