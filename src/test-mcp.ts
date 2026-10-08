import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Asegurar carga correcta del .env sin importar el directorio de ejecución
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const OPENPROJECT_URL = process.env.OPENPROJECT_URL || "http://localhost:8080";
const API_KEY = process.env.OPENPROJECT_API_KEY;

if (!API_KEY) {
  console.error("❌ ERROR: La variable OPENPROJECT_API_KEY no está cargada.");
  process.exit(1);
}

const api = axios.create({
  baseURL: `${OPENPROJECT_URL}/api/v3`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`apikey:${API_KEY}`).toString("base64")}`,
  },
});

async function validarConexionYCrearHU() {
  console.log("🔍 Testing conexión con OpenProject...");

  try {
    // 1. Probar conectividad y leer proyectos existentes
    const projectsRes = await api.get("/projects");
    console.log(`✅ Conexión exitosa. Proyectos encontrados: ${projectsRes.data.total}`);

    // Buscar el proyecto 'sirap-main'
    const proyecto = projectsRes.data._embedded.elements.find(
      (p: any) => p.identifier === "sirap-main"
    );

    if (!proyecto) {
      console.error("⚠️ El proyecto 'sirap-main' no se encontró en OpenProject. Créalo en la UI primero.");
      return;
    }

    console.log(`📌 Proyecto destino encontrado: ${proyecto.name} (ID: ${proyecto.id})`);

    // 2. Obtener el formulario para extraer las URLs/links válidos de las listas desplegables (CustomOption)
    console.log("🔍 Obteniendo opciones válidas del formulario (Type 39)...");
    const formRes = await api.post("/projects/sirap-main/work_packages/form", {
      _links: {
        type: { href: "/api/v3/types/39" }
      }
    });

    const schema = formRes.data._embedded?.schema;
    
    // Extraer primera opción disponible para Tipo_HU (customField1) y Estado_HITL (customField4)
    const tipoHuOptions = schema?.customField1?._embedded?.allowedValues || [];
    const estadoHitlOptions = schema?.customField4?._embedded?.allowedValues || [];

    const tipoHuHref = tipoHuOptions.length > 0 ? tipoHuOptions[0]._links.self.href : null;
    const estadoHitlHref = estadoHitlOptions.length > 0 ? estadoHitlOptions[0]._links.self.href : null;

    // 3. Simular la ejecución de la herramienta 'crear_historia_usuario'
    console.log("🚀 Enviando payload de prueba para crear HU Mock...");
    
    const mockPayload: any = {
      subject: "HU Mock Test: Autenticación de usuarios vía MCP",
      description: {
        format: "markdown",
        raw: "Como usuario registrado, quiero iniciar sesión en el sistema para acceder a mis proyectos.",
      },
      _links: {
        project: { href: `/api/v3/projects/sirap-main` },
        type: { href: "/api/v3/types/39" }, // ID 39 correspondiente a User Story
      },
      // Campos de Texto Formateado (Formattable)
      customField2: {
        format: "markdown",
        raw: "Given un usuario registrado\nWhen ingresa credenciales válidas\nThen accede al dashboard",
      },
      customField5: {
        format: "markdown",
        raw: "Criterios estructurados automáticamente según plantilla Gherkin estándar.",
      },
      // Campo de Texto Simple (String)
      customField3: "Transcripción Minuto 04:15",
    };

    // Agregar opciones seleccionadas en _links para campos de tipo CustomOption
    if (tipoHuHref) {
      mockPayload._links.customField1 = { href: tipoHuHref };
    }
    if (estadoHitlHref) {
      mockPayload._links.customField4 = { href: estadoHitlHref };
    }

    const huRes = await api.post("/work_packages", mockPayload);
    console.log(`🎉 ¡ÉXITO! HU Creada en OpenProject con ID: ${huRes.data.id}`);
    console.log(`🔗 Ver en navegador: ${OPENPROJECT_URL}/work_packages/${huRes.data.id}`);

  } catch (error: any) {
    console.error("❌ Error de comunicación con OpenProject:");
    if (error.response?.data?._embedded?.errors) {
      console.error(JSON.stringify(error.response.data._embedded.errors, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

validarConexionYCrearHU();
