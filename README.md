# mcp-openproject

Servidor MCP (Model Context Protocol) que permite a un modelo de lenguaje crear **Historias de Usuario (HU)** en [OpenProject](https://www.openproject.org/) con sus campos personalizados ya resueltos. Está pensado para flujos de automatización (p. ej. n8n con generación de criterios Gherkin por IA) y para clientes MCP como Claude Code o Claude Desktop.

## Qué hace

Expone una única herramienta MCP:

### `crear_historia_usuario`

Crea un *work package* de tipo HU en OpenProject.

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `projectKey` | Sí | Identificador del proyecto (ej. `sirap-main`). Por defecto `sirap-main` si no llega. |
| `subject` | Sí | Título de la HU. |
| `gherkin` | Sí | Criterios de aceptación en Gherkin. Se envuelve en un bloque ```` ```gherkin ```` si no lo está. |
| `description` | No | Descripción detallada (Markdown). |
| `tipoHU` | No | Nombre (ej. `HU-IA`) o ID del tipo de HU. Se resuelve contra las opciones permitidas del proyecto. |
| `estadoHITL` | No | Nombre (ej. `Borrador IA`) o ID del estado HITL. Se resuelve igual que `tipoHU`. |
| `fuente` | No | Origen del requerimiento. Por defecto `n8n BDD Automation`. |
| `justificacionIA` | No | Justificación de la IA. Se formatea como nota blockquote si no lo está. |

Flujo interno al crear una HU:

1. Normaliza `gherkin` y `justificacionIA` a Markdown.
2. Para `tipoHU` y `estadoHITL`, pide el formulario del work package (`POST /api/v3/projects/{projectKey}/work_packages/form`) y busca la opción permitida por etiqueta, ID o href. Si el valor es numérico y no coincide con ninguna opción, usa `/api/v3/custom_options/{id}`. Si no llega valor, toma la primera opción permitida.
3. Crea el work package con `POST /api/v3/work_packages`. El tipo es `OPENPROJECT_TYPE_ID` (por defecto `39`) y los campos personalizados se mapean así:

| Campo OpenProject | Contenido |
|---|---|
| `customField1` | `tipoHU` (resuelto) |
| `customField2` | Gherkin |
| `customField3` | `fuente` |
| `customField4` | `estadoHITL` (resuelto) |
| `customField5` | Justificación IA |

Respuesta de éxito: texto con el ID creado y un enlace al work package. Si OpenProject devuelve error, se devuelve el detalle de `_embedded.errors` o el mensaje HTTP.

## Arquitectura

```
Cliente MCP (Claude Code, Claude Desktop)      n8n / automatizaciones
        │  stdio (MCP)                                │  HTTP POST /messages (JSON-RPC)
        └──────────────────┬──────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────┐
│  mcp-openproject  (src/index.ts)                     │
│  ├─ @modelcontextprotocol/sdk  → tools/list, tools/call (modo stdio)
│  ├─ express 5                  → POST /messages, GET /health (modo http/sse)
│  ├─ ejecutarCrearHU()          → lógica de negocio compartida por ambos modos
│  └─ axios                       → API REST v3 de OpenProject
└──────────────────────────────────────────────────────┘
                           │  HTTP(S), Basic auth  "apikey:<OPENPROJECT_API_KEY>"
                           ▼
                 OpenProject (OPENPROJECT_URL)  →  {url}/api/v3
```

Puntos clave:

- **Un solo núcleo, dos transportes.** `MCP_TRANSPORT` elige el modo. Con `stdio` (valor por defecto) se conecta el `Server` del SDK a `StdioServerTransport`. Con `http` o `sse` se levanta Express y se expone un endpoint propio. Ambos llaman a `ejecutarCrearHU()`.
- **Endpoint `/messages` no es el transporte MCP estándar.** Acepta un JSON-RPC simple con `method: "tools/call"` y `params.name: "crear_historia_usuario"`, pensado para llamadas directas desde n8n. Cualquier otro método responde `-32601`.
- **Cliente de OpenProject.** Una instancia de `axios` con `baseURL = {OPENPROJECT_URL}/api/v3`, cabecera `Authorization: Basic base64("apikey:<key>")` y cabecera `Host` configurable.
- **Carga de `.env`.** `dotenv` lee `../.env` relativo a `dist/index.js` (o `src/index.ts` en dev), es decir, la raíz del proyecto. En contenedor no hay `.env`; las variables se inyectan desde fuera.

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `OPENPROJECT_URL` | `http://openproject_spb:80` | URL base de OpenProject, sin barra final. |
| `OPENPROJECT_API_KEY` | — | **Obligatoria.** API key del usuario de OpenProject. Si falta, el proceso termina con código 1. |
| `OPENPROJECT_PUBLIC_URL` | `http://localhost:8080` | URL que ve el usuario en el navegador; se usa en los enlaces de la respuesta. |
| `OPENPROJECT_HOST_HEADER` | — | Si se define, se envía como cabecera `Host` a OpenProject. Necesario cuando OpenProject valida el host (`OPENPROJECT_HOST__NAME`). |
| `OPENPROJECT_TYPE_ID` | `39` | ID del tipo de work package usado para HU. |
| `OPENPROJECT_DEFAULT_PROJECT` | `sirap-main` | Proyecto usado si `projectKey` no llega. |
| `MCP_TRANSPORT` | `stdio` | `stdio`, `http` o `sse`. Los dos últimos levantan el servidor HTTP. |
| `PORT` | `3000` | Puerto del servidor HTTP (modo `http`/`sse`). |

Ejemplo `.env` para desarrollo local (no versionar). Plantilla completa en `.env.example`:

```env
OPENPROJECT_URL=http://localhost:8080
OPENPROJECT_API_KEY=tu_api_key
MCP_TRANSPORT=stdio
```

## Endpoints HTTP (modo `http` / `sse`)

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/health` | Responde `MCP HTTP OK` con 200. Lo usa el `HEALTHCHECK` del contenedor. |
| `POST` | `/messages` | Llamada JSON-RPC a `crear_historia_usuario`. |

Ejemplo:

```bash
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "crear_historia_usuario",
      "arguments": {
        "projectKey": "sirap-main",
        "subject": "Login con MFA",
        "gherkin": "Feature: Login\n  Scenario: Acceso con MFA\n    Given ...",
        "tipoHU": "HU-IA",
        "estadoHITL": "Borrador IA"
      }
    }
  }'
```

## Requisitos

- Node.js 20 o superior y npm (el contenedor usa `node:20-alpine`).
- Instancia de OpenProject accesible desde donde corre el servidor.
- API key de OpenProject: *Mi cuenta → Tokens de acceso → API*. La clave tiene los mismos permisos que el usuario; usar una cuenta de servicio con permisos mínimos sobre los proyectos necesarios.
- Docker (opcional, para despliegue en contenedor).

## Instalación local

```bash
git clone <url-del-repositorio> mcp-openproject
cd mcp-openproject

npm ci                 # instala dependencias desde package-lock.json
# crear .env con OPENPROJECT_URL y OPENPROJECT_API_KEY

npm run dev            # desarrollo: ejecuta src/index.ts con tsx (stdio por defecto)
npm run build          # compila src/ a dist/ con tsc
npm start              # ejecuta dist/index.js
```

Para probar el modo HTTP en local:

```bash
MCP_TRANSPORT=http PORT=3000 npm run dev
curl http://localhost:3000/health
```

Notas de TypeScript:

- `module` y `moduleResolution` son `NodeNext`: los imports relativos deben terminar en `.js`.
- `strict` activo. `rootDir: ./src`, `outDir: ./dist`.

Scripts auxiliares en `src/` (se compilan junto con el resto, no forman parte del servidor):

- `test-mcp.ts`, `test-crear-hu.ts`: pruebas manuales contra OpenProject.
- `get-fields.ts`: inspecciona el esquema de formulario de un tipo de work package.

No hay suite de tests ni linter configurados.

## Despliegue con Docker Compose (OpenProject + MCP)

`docker-compose.yml` levanta OpenProject 17 y el MCP en la red `spb-network`. Las credenciales salen de `.env`:

```bash
cp .env.example .env     # completar OPENPROJECT_API_KEY y OPENPROJECT_SECRET_KEY_BASE
docker compose up -d --build
docker compose ps
curl http://localhost:3000/health
```

Puertos publicados: OpenProject en `http://localhost:8080`, MCP en `http://localhost:3000`. El MCP usa `http://openproject_spb:80` internamente; `OPENPROJECT_PUBLIC_URL` controla el enlace que ve el usuario.

Ojo: `docker compose config` imprime los valores resueltos, incluidas las credenciales. No pegarlo en logs ni en el chat.

## Despliegue con Docker (imagen sola)

El `Dockerfile` es multi-etapa:

1. **builder** (`node:20-alpine`): `npm ci`, copia el código y ejecuta `npm run build`.
2. **runner** (`node:20-alpine`): `npm ci --omit=dev`, copia `dist/` y ejecuta como usuario `node` (no root). Define `NODE_ENV=production`, `MCP_TRANSPORT=http`, `PORT=3000`, expone el puerto `3000` y tiene `HEALTHCHECK` contra `/health`.

`.dockerignore` excluye `.env`, `node_modules/`, `dist/` y `.git`: **las credenciales no se hornean en la imagen**; se inyectan en `docker run`.

```bash
# Construir la imagen
docker build -t mcp-openproject:latest .

# Ejecutar inyectando el .env en runtime, publicando el puerto 3000
docker run -d --name mcp-openproject \
  --env-file .env \
  -p 3000:3000 \
  mcp-openproject:latest

# Verificar
curl http://localhost:3000/health
docker logs -f mcp-openproject
```

Variables de entorno sin archivo:

```bash
docker run -d --name mcp-openproject \
  -e OPENPROJECT_URL=https://openproject.ejemplo.com \
  -e OPENPROJECT_API_KEY=tu_api_key \
  -p 3000:3000 \
  mcp-openproject:latest
```

### Conectar con OpenProject en Docker

El valor por defecto de `OPENPROJECT_URL` es `http://openproject_spb:80`, que corresponde a un servicio llamado `openproject_spb` en la misma red de Docker. Si OpenProject corre en otro contenedor, el MCP debe estar en esa red:

```bash
docker run -d --name mcp-openproject \
  --network <red-de-openproject> \
  --env-file .env \
  -p 3000:3000 \
  mcp-openproject:latest
```

Desde el contenedor, `localhost` apunta a sí mismo, no al host. Para una OpenProject en la máquina anfitriona usar `http://host.docker.internal:<puerto>` (en Linux agregar `--add-host=host.docker.internal:host-gateway`).

### Publicar la imagen

```bash
docker tag mcp-openproject:latest <registro>/mcp-openproject:<versión>
docker push <registro>/mcp-openproject:<versión>
```

Nunca incluir `.env` en la imagen ni en el registro.

## Configuración en un cliente MCP

**stdio** (cliente lanza el proceso local): ejemplo para `.mcp.json` de Claude Code:

```json
{
  "mcpServers": {
    "openproject": {
      "command": "node",
      "args": ["/ruta/absoluta/a/mcp-openproject/dist/index.js"],
      "env": {
        "OPENPROJECT_URL": "https://openproject.ejemplo.com",
        "OPENPROJECT_API_KEY": "tu_api_key"
      }
    }
  }
}
```

**HTTP** (servidor en contenedor): el cliente que soporte transporte HTTP/SSE debe apuntar a `http://<host>:3000`. Para llamadas directas desde n8n usar `POST /messages` como en el ejemplo de arriba.

## Puntos a revisar

- El mapeo `customField1`–`customField5` sigue fijo en el código; depende de la instancia de OpenProject.
- Default de `OPENPROJECT_URL` apunta a un servicio Docker llamado `openproject_spb`.

## Seguridad

- No versionar `.env` ni registrar la API key en logs.
- El endpoint `POST /messages` no tiene autenticación propia. En modo `http` exponerlo solo en red interna o detrás de un proxy con autenticación.
- Rotar la API key si se expone.
