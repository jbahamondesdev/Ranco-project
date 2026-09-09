# PRD: Plataforma local de extracción y mapeo de documentos (MVP)

## 1. Metadata
- **Proyecto:** Plataforma de extracción de documentos con editor visual de flujos
- **Fecha:** 04 de septiembre de 2026
- **Versión:** 1.0 (MVP local)
- **Estado:** Borrador para revisión

## 2. Resumen
Aplicación web local que permite configurar, mediante un editor visual de nodos (estilo n8n), esquemas de extracción de datos para distintos tipos de documento, y ejecutar el pipeline completo de ingesta → clasificación → extracción (Azure Document Intelligence) → mapeo (Azure OpenAI) → validación → resultado, dejando todo el historial persistido localmente.

## 3. Planteamiento del problema
Hoy no existe una forma centralizada ni configurable de definir qué datos extraer de cada tipo de documento (facturas, contratos, formularios, etc.), probar esa configuración contra un documento real, y ejecutar el proceso de forma repetible sin depender de scripts ad-hoc. Cada nuevo tipo de documento requiere trabajo manual de desarrollo en vez de configuración.

## 4. Objetivos y métricas de éxito
- Permitir crear y publicar un nuevo tipo de documento (esquema + reglas) en menos de 15 minutos sin escribir código.
- Lograr que el 90% de los campos extraídos en el set de prueba tengan nivel de confianza suficiente para no requerir revisión manual.
- Tener el pipeline completo (ingesta → resultado) corriendo end-to-end de forma local para el MVP.

## 5. No-objetivos (fuera de scope del MVP)
- Power BI u otro dashboard de analítica — se deja para una fase posterior.
- Azure Cosmos DB — se reemplaza por SQL Server Express local.
- Azure Container Apps — todo corre local (backend FastAPI + frontend), sin contenedores por ahora.
- Ejecución en tiempo real del flujo dentro del editor de nodos — en el MVP el editor solo configura el flujo; la ejecución se dispara aparte.
- Integración con fuentes externas de ingesta (Blob Storage, SharePoint) — solo carga manual desde la app en el MVP.

## 6. Personas
- **Administrador:** configura tipos de documento, esquemas y reglas de validación mediante el editor de nodos.
- **Operador:** sube documentos para procesar y revisa resultados marcados como dudosos.
- **Revisor:** valida o corrige campos extraídos con baja confianza antes de dar por cerrado el resultado.

## 7. Historias de usuario y criterios de aceptación

**HU1 — Configurar un tipo de documento con el editor de nodos**
Como administrador, quiero armar visualmente el flujo de extracción de un tipo de documento (campos, tipo de dato, reglas de validación), para no depender de código.
- *Criterio de aceptación:* el editor permite crear nodos de "campo a extraer" con tipo de dato, marcarlo obligatorio/opcional, y conectar reglas de validación; el flujo se guarda como configuración versionada.

**HU2 — Cargar documento de referencia y previsualizar extracción**
Como administrador, quiero subir un documento de ejemplo y ver el resultado de extracción con la configuración candidata antes de publicarla.
- *Criterio de aceptación:* al ejecutar la vista previa, se muestran los valores extraídos, su nivel de confianza y la evidencia (ubicación en el documento) para cada campo definido.

**HU3 — Procesar un documento nuevo**
Como operador, quiero subir un documento y que el sistema lo clasifique, extraiga y mapee automáticamente según el tipo correspondiente.
- *Criterio de aceptación:* el documento pasa por ingesta → clasificación (manual o automática) → extracción → mapeo → validación, y el resultado queda visible en la interfaz de monitoreo con su estado final.

**HU4 — Revisar resultados con baja confianza**
Como revisor, quiero ver solo los documentos que requieren revisión humana, para corregir campos antes de cerrar el proceso.
- *Criterio de aceptación:* los documentos con campos bajo el umbral de confianza definido (o campos obligatorios ausentes) quedan marcados como "requiere revisión" y son editables desde la interfaz.

## 8. Requisitos funcionales

1. **Configuración de esquema de extracción por tipo de documento**: definir campos, tipo de dato esperado, estados posibles, reglas de validación y versión de la configuración, desde el editor de nodos.
2. **Módulo autoservicio de carga de documento de referencia**: subir un documento de ejemplo para usarlo como base al configurar un nuevo tipo.
3. **Módulo de vista previa y validación**: ejecutar la configuración candidata sobre el documento de referencia y mostrar campos, valores, confianza y evidencia antes de publicar.
4. **Persistencia y versionado de tipos de documento**: guardar configuraciones (campos, reglas, versión, estado de publicación) en SQL Server Express local.
5. **Ingesta de documentos**: carga manual de documentos desde la aplicación web (dejar el diseño abierto a futuras integraciones externas).
6. **Selección/clasificación de tipo de documento**: manual en el MVP, con posibilidad de automatizarla después.
7. **Integración con Azure Document Intelligence**: para obtener texto, tablas, estructura y niveles de confianza del documento.
8. **Motor de mapeo con Azure OpenAI**: interpretar el contenido extraído y mapearlo al esquema definido, considerando confianza y reglas configuradas.
9. **Orquestación del flujo de procesamiento**: ingesta → clasificación → extracción → mapeo → validación → (revisión si corresponde) → resultado final, con manejo de estados, trazabilidad, errores y reintentos.
10. **Validación y control de calidad**: reglas para determinar si un resultado avanza automáticamente o requiere revisión humana, según confianza, campos obligatorios y formato.
11. **Almacenamiento intermedio**: guardar documentos originales, resultados de extracción y archivos asociados en disco local, con trazabilidad para reprocesamientos.
12. **Interfaz de monitoreo**: ver estado de documentos y ejecuciones, historial, errores y avance del procesamiento; incluir, cuando existan ejecuciones históricas, una vista del flujo de datos recorrido.
13. **Autenticación y perfiles de usuario**: control de acceso diferenciado (administrador, operador, revisor).
14. **Salida configurable**: definir qué datos, con qué formato y metadata se entregan como resultado final.
15. **Alertas y notificaciones**: avisos ante fallas de procesamiento, errores de integración, campos críticos ausentes o resultados bajo el umbral definido.

## 9. Requisitos no funcionales
- El backend (FastAPI) debe exponer una API REST clara para que el frontend (editor de nodos) consuma configuración, ejecución y monitoreo.
- Los documentos y datos extraídos deben poder eliminarse a pedido del usuario (privacidad).
- El sistema debe tolerar reintentos ante fallas transitorias de Azure Document Intelligence o Azure OpenAI, sin perder el estado del documento.
- La base SQL Server Express local debe contener el historial completo de ejecuciones para poder reconstruir el flujo de datos de cada documento procesado.
- El editor de nodos debe funcionar en navegador de escritorio (Chrome/Edge) sin requerir instalación adicional.

## 10. Arquitectura técnica propuesta
- **Frontend:** aplicación web con editor visual de nodos usando `@xyflow/react` (React + TypeScript) para configurar tipos de documento y sus reglas.
- **Backend:** Python con FastAPI, orquestando ingesta, clasificación, extracción, mapeo y validación.
- **Persistencia:** SQL Server Express local (configuraciones, historial de ejecuciones, resultados).
- **Almacenamiento de archivos:** disco local (documentos originales y resultados), con estructura que permita migrar a Azure Blob Storage más adelante si se requiere.
- **Servicios externos:** Azure Document Intelligence (extracción) y Azure OpenAI vía Foundry (mapeo con LLM).
- **Cola de procesamiento (MVP):** tabla de estado en SQL Server Express + tareas en background de FastAPI; se deja abierta la migración a una cola dedicada (ej. Celery + Redis) si el volumen lo justifica más adelante.

## 11. Dependencias y riesgos
- Depende de credenciales y disponibilidad de Azure Document Intelligence y Azure OpenAI.
- Riesgo: sin Container Apps ni una cola robusta, el procesamiento concurrente de muchos documentos puede degradar el rendimiento local → mitigación: limitar concurrencia en el MVP y dejar la arquitectura lista para escalar después.
- Riesgo: SQL Server Express tiene límites de tamaño de base de datos (10 GB) → mitigación: monitorear crecimiento y definir política de purga o migración a SQL Server estándar si se supera.

## 12. Hitos y preguntas abiertas
**Hitos (a definir con el equipo):**
- Definición final de esquema de configuración de tipos de documento
- Editor de nodos funcional (crear/editar/publicar tipo de documento)
- Pipeline de ejecución end-to-end (ingesta → resultado)
- Interfaz de monitoreo con historial

**Preguntas abiertas:**
- ¿La clasificación automática de tipo de documento entra en el MVP o queda para después? — Dueño: Producto.
- ¿Qué perfiles de usuario se necesitan realmente en el MVP (¿alcanza con admin + operador, o se requiere revisor separado desde el día uno)? — Dueño: Producto.
- ¿Se requiere autenticación real (usuarios/contraseñas) en el MVP local, o basta con un modo sin login para la primera versión interna? — Dueño: Equipo técnico.

**Historial de cambios:**
| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 04 sept 2026 | Versión inicial, scope reducido a MVP local |
