# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Servidor MCP (Model Context Protocol) para OpenProject. TypeScript en ESM (`"type": "module"`), con `@modelcontextprotocol/sdk`, `express` 5 (transporte HTTP), `axios` (cliente de la API de OpenProject) y `dotenv`.

## Comandos

- `npm run dev` — ejecuta `src/index.ts` con `tsx` (sin compilar).
- `npm run build` — compila con `tsc` a `dist/`.
- `npm start` — ejecuta `dist/index.js` (requiere build previo).

No hay tests ni linter configurados.

## Configuración

`.env` define `OPENPROJECT_URL` y `OPENPROJECT_API_KEY`. No versionar el `.env` ni copiar sus valores en código o commits.

## TypeScript

- `module` y `moduleResolution` son `NodeNext`: los imports relativos deben incluir la extensión `.js` (aunque el archivo sea `.ts`).
- `rootDir` es `./src`, `outDir` es `./dist`, modo `strict` activo.

## Docker

Build multi-etapa sobre `node:20-alpine`:
- Etapa `builder`: `npm ci`, copia el código y ejecuta `npm run build`.
- Etapa `runner`: `npm ci --only=production`, copia `dist/` y arranca con `node dist/index.js`.

## Estado del código

`src/` todavía no existe; el punto de entrada esperado es `src/index.ts`. Documentar aquí la arquitectura (registro de tools MCP, cliente OpenProject, transporte) cuando haya código que la muestre.
