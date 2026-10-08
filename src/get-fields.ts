import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const OPENPROJECT_URL = process.env.OPENPROJECT_URL || "http://localhost:8080";
const API_KEY = process.env.OPENPROJECT_API_KEY;

const api = axios.create({
  baseURL: `${OPENPROJECT_URL}/api/v3`,
  headers: {
    Authorization: `Basic ${Buffer.from(`apikey:${API_KEY}`).toString("base64")}`,
  },
});

async function inspectFormSchema() {
  try {
    console.log("🔍 Consultando esquema para el tipo User Story (ID 39) en 'sirap-main'...");
    
    // Usamos el ID 39 detectado en la URL del navegador
    const res = await api.post("/projects/sirap-main/work_packages/form", {
      _links: {
        type: { href: "/api/v3/types/39" }
      }
    });

    const schema = res.data._embedded?.schema;
    if (!schema) {
      console.log("❌ No se encontró el esquema en la respuesta.");
      return;
    }

    console.log("\n📋 CAMPOS PERSONALIZADOS MAPEADOS CON ÉXITO:\n");
    
    Object.keys(schema).forEach((key) => {
      if (key.startsWith("customField")) {
        const fieldInfo = schema[key];
        console.log(`- Campo: "${fieldInfo.name}"`);
        console.log(`  👉 Clave API exacta: ${key}`);
        console.log(`  👉 Tipo de dato: ${fieldInfo.type}\n`);
      }
    });

  } catch (err: any) {
    console.error("\n❌ Error al consultar el formulario:");
    console.error("Status:", err.response?.status);
    console.error("Detalle:", err.response?.data?.message || err.message);
  }
}

inspectFormSchema();
