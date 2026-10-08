import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const OPENPROJECT_URL = process.env.OPENPROJECT_URL || "http://openproject_spb:80";
// URL que ve el usuario en el navegador (enlaces); puede diferir de la URL interna de Docker
const OPENPROJECT_PUBLIC_URL = process.env.OPENPROJECT_PUBLIC_URL || "http://localhost:8080";
const API_KEY = process.env.OPENPROJECT_API_KEY;
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || "stdio";
const PORT = process.env.PORT || 3000;
const TYPE_ID = process.env.OPENPROJECT_TYPE_ID || "39";
const DEFAULT_PROJECT = process.env.OPENPROJECT_DEFAULT_PROJECT || "sirap-main";

if (!API_KEY) {
  process.stderr.write("❌ ERROR: La variable OPENPROJECT_API_KEY no está cargada.\n");
  process.exit(1);
}

// Host forzado solo si se define OPENPROJECT_HOST_HEADER (necesario cuando OpenProject valida el Host)
const api = axios.create({
  baseURL: `${OPENPROJECT_URL}/api/v3`,
  headers: {
    "Content-Type": "application/json",
    ...(process.env.OPENPROJECT_HOST_HEADER ? { "Host": process.env.OPENPROJECT_HOST_HEADER } : {}),
    "Authorization": `Basic ${Buffer.from(`apikey:${API_KEY}`).toString("base64")}`,
  },
});

function formatGherkinMarkdown(rawGherkin: string): string {
  if (!rawGherkin || rawGherkin.trim() === "") return "";
  if (rawGherkin.trim().startsWith("```")) return rawGherkin;
  return "```gherkin\n" + rawGherkin.trim() + "\n```";
}

function formatJustificacionIAMarkdown(rawJustification: string): string {
  const text = rawJustification || "Criterios estructurados automáticamente según plantilla Gherkin estándar.";
  if (text.trim().startsWith("###") || text.trim().startsWith(">")) return text;
  return `> 🤖 **Nota de Generación IA:**\n> ${text.trim().replace(/\n/g, "\n> ")}`;
}

async function resolveOptionHrefFromForm(
  projectKey: string,
  typeId: string,
  customFieldKey: string,
  inputValue?: string
): Promise<{ href: string } | null> {
  try {
    const formRes = await api.post(`/projects/${encodeURIComponent(projectKey)}/work_packages/form`, {
      _links: {
        type: { href: `/api/v3/types/${typeId}` },
      },
    });

    const schema = formRes.data._embedded?.schema;
    const allowedValues = schema?.[customFieldKey]?._embedded?.allowedValues || [];

    if (allowedValues.length === 0) return null;

    if (!inputValue || inputValue.trim() === "") {
      return { href: allowedValues[0]._links.self.href };
    }

    const cleanInput = inputValue.trim().toLowerCase();

    for (const opt of allowedValues) {
      const optLabel = (opt.value || opt.title || "").toLowerCase().trim();
      const optHref = opt._links?.self?.href || "";
      const optId = optHref.split("/").pop();

      if (
        optLabel === cleanInput ||
        optId === cleanInput ||
        optHref === inputValue.trim()
      ) {
        return { href: optHref };
      }
    }

    if (!isNaN(Number(inputValue.trim()))) {
      return { href: `/api/v3/custom_options/${inputValue.trim()}` };
    }
  } catch (error) {
    process.stderr.write(`Error resolviendo ${customFieldKey}: ${error}\n`);
  }

  return null;
}

// Lógica de ejecución de la herramienta
async function ejecutarCrearHU(args: Record<string, any>) {
  try {
    const projectKey = args.projectKey || DEFAULT_PROJECT;
    const typeId = TYPE_ID;

    const formattedGherkin = formatGherkinMarkdown(args.gherkin || "");
    const formattedJustificacion = formatJustificacionIAMarkdown(args.justificacionIA || "");

    const payload: any = {
      subject: args.subject || "Historia de Usuario sin título",
      description: {
        format: "markdown",
        raw: args.description || "",
      },
      _links: {
        project: { href: `/api/v3/projects/${encodeURIComponent(projectKey)}` },
        type: { href: `/api/v3/types/${typeId}` },
      },
      customField2: {
        format: "markdown",
        raw: formattedGherkin,
      },
      customField5: {
        format: "markdown",
        raw: formattedJustificacion,
      },
      customField3: args.fuente || "n8n BDD Automation",
    };

    // Resolver dinámicamente campos opcionales
    const tipoHuHref = await resolveOptionHrefFromForm(projectKey, typeId, "customField1", args.tipoHU);
    if (tipoHuHref) payload._links.customField1 = tipoHuHref;

    const estadoHitlHref = await resolveOptionHrefFromForm(projectKey, typeId, "customField4", args.estadoHITL);
    if (estadoHitlHref) payload._links.customField4 = estadoHitlHref;

    const res = await api.post("/work_packages", payload);

    return {
      content: [
        {
          type: "text",
          text: `🎉 ¡ÉXITO! HU Creada en OpenProject con ID: ${res.data.id}\n🔗 Ver en navegador: ${OPENPROJECT_PUBLIC_URL}/work_packages/${res.data.id}`,
        },
      ],
    };
  } catch (error: any) {
    // Si OpenProject responde con un error HTTP (400, 422, 403, etc.)
    const opErrorDetails = error.response?.data?._embedded?.errors
      ? JSON.stringify(error.response.data._embedded.errors, null, 2)
      : error.response?.data?.message || error.message;

    console.error("❌ Error de la API de OpenProject:", opErrorDetails);

    throw new Error(`OpenProject API Error: ${opErrorDetails}`);
  }
}

const server = new Server(
  { name: "openproject-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "crear_historia_usuario",
        description: "Crea una Historia de Usuario en OpenProject vinculando sus campos personalizados de forma dinámica.",
        inputSchema: {
          type: "object",
          properties: {
            projectKey: { type: "string", description: "Identificador del proyecto (ej: sirap-main)" },
            subject: { type: "string", description: "Título de la HU" },
            description: { type: "string", description: "Descripción detallada de la HU" },
            gherkin: { type: "string", description: "Criterios de aceptación en formato Gherkin" },
            tipoHU: { type: "string", description: "Nombre (ej: HU-IA) o ID del tipo de HU (Opcional)" },
            fuente: { type: "string", description: "Origen o fuente del requerimiento" },
            justificacionIA: { type: "string", description: "Justificación de la IA" },
            estadoHITL: { type: "string", description: "Nombre (ej: Borrador IA) o ID del estado HITL (Opcional)" }
          },
          required: ["projectKey", "subject", "gherkin"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "crear_historia_usuario") {
    return await ejecutarCrearHU((request.params.arguments || {}) as Record<string, any>);
  }
  throw new Error(`Herramienta no encontrada: ${request.params.name}`);
});

async function runServer() {
  if (MCP_TRANSPORT === "sse" || MCP_TRANSPORT === "http") {
    const app = express();
    app.use(express.json());

    // Endpoint directo para llamadas JSON-RPC desde n8n
    app.post("/messages", async (req, res) => {
      try {
        const { method, params } = req.body;
        
        if (method === "tools/call" && params?.name === "crear_historia_usuario") {
          const result = await ejecutarCrearHU(params.arguments || {});
          return res.json({
            jsonrpc: "2.0",
            result,
            id: req.body.id || 1
          });
        }

        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32601, message: "Método o herramienta no soportada" },
          id: req.body.id || 1
        });
      } catch (err: any) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: err.message },
          id: req.body.id || 1
        });
      }
    });

    app.get("/health", (_, res) => res.send("MCP HTTP OK"));

    app.listen(PORT, () => {
      console.log(`🚀 Servidor MCP HTTP escuchando en el puerto ${PORT}`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

runServer().catch((err) => {
  process.stderr.write(`Error crítico en el servidor MCP: ${err}\n`);
  process.exit(1);
});
