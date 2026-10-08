import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const OPENPROJECT_URL = process.env.OPENPROJECT_URL || "http://openproject:80";
const API_KEY = process.env.OPENPROJECT_API_KEY;

if (!API_KEY) {
  process.stderr.write("❌ ERROR: La variable OPENPROJECT_API_KEY no está configurada.\n");
  process.exit(1);
}

// Instancia de Axios alineada con las cabeceras de OpenProject v17
const api = axios.create({
  baseURL: `${OPENPROJECT_URL}/api/v3`,
  headers: {
    "Content-Type": "application/json",
    "Host": "localhost:8080",
    "Authorization": `Basic ${Buffer.from(`apikey:${API_KEY}`).toString("base64")}`,
  },
});

async function testCrearHistoriaUsuario() {
  const projectKey = "sirap-main";
  const typeId = "39"; // User Story

  console.log("🚀 Iniciando prueba de creación de HU en OpenProject...");

  try {
    // 1. Obtener opciones válidas desde el endpoint /form
    console.log("🔍 Consultando esquema del formulario...");
    const formRes = await api.post(`/projects/${projectKey}/work_packages/form`, {
      _links: {
        type: { href: `/api/v3/types/${typeId}` },
      },
    });

    const schema = formRes.data._embedded?.schema;
    const tipoHuOptions = schema?.customField1?._embedded?.allowedValues || [];
    const estadoHitlOptions = schema?.customField4?._embedded?.allowedValues || [];

    // Tomar la primera opción disponible por defecto si existen
    const tipoHuHref = tipoHuOptions.length > 0 ? tipoHuOptions[0]._links.self.href : null;
    const estadoHitlHref = estadoHitlOptions.length > 0 ? estadoHitlOptions[0]._links.self.href : null;

    // 2. Construir Payload
    const payload: any = {
      subject: "HU: Test directo desde script TypeScript",
      description: {
        format: "markdown",
        raw: "Prueba técnica de envío de payload estructurado a OpenProject.",
      },
      _links: {
        project: { href: `/api/v3/projects/${projectKey}` },
        type: { href: `/api/v3/types/${typeId}` },
      },
      customField2: {
        format: "markdown",
        raw: "Escenario: Prueba de script\nDado que ejecuto el comando tsx\nCuando responde la API\nEntonces se registra la HU",
      },
      customField5: {
        format: "markdown",
        raw: "Generado automáticamente para prueba técnica.",
      },
      customField3: "Prueba Local TypeScript",
    };

    if (tipoHuHref) payload._links.customField1 = { href: tipoHuHref };
    if (estadoHitlHref) payload._links.customField4 = { href: estadoHitlHref };

    // 3. Enviar petición a OpenProject
    console.log("📦 Enviando payload a /api/v3/work_packages...");
    const res = await api.post("/work_packages", payload);

    console.log(`\n🎉 ¡ÉXITO! HU Creada en OpenProject con ID: ${res.data.id}`);
    console.log(`🔗 Ver en navegador: http://localhost:8080/work_packages/${res.data.id}\n`);
  } catch (error: any) {
    console.error("❌ Error durante la creación de la HU:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Detalles:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testCrearHistoriaUsuario();
