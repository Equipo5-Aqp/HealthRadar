# HealthRadar - Sistema de Vigilancia Epidemiológica Automatizada

> **Plataforma Integral de Procesamiento de Datos de Salud Pública y Automatización DevSecOps**
> *Desarrollado por la Célula 5 (Arequipa, Perú)*

---

## Descripción General del Proyecto

HealthRadar es una solución tecnológica avanzada diseñada para automatizar de forma íntegra la vigilancia epidemiológica en el territorio peruano. El objetivo fundamental de la plataforma es consolidar, procesar y analizar de manera desatendida las enfermedades de notificación obligatoria reportadas oficialmente por el MINSA y el CDC del Perú, cruzando dicha información en tiempo real con las variables climáticas obtenidas a través de la interfaz de programación de aplicaciones de Open-Meteo. Adicionalmente, el sistema integra una interfaz moderna basada en lenguaje natural para que los analistas de salud pública consulten el historial clínico y epidemiológico con total seguridad, precisión y trazabilidad operativa.

---

## Arquitectura del Sistema y Flujo de Datos

El diseño arquitectónico del software se fundamenta en una separación estricta de responsabilidades distribuidas en capas lógicas totalmente independientes, lo cual garantiza la escalabilidad a largo plazo, el mantenimiento simplificado y la seguridad rigurosa del núcleo de procesamiento. En la capa superior se encuentra el Frontend desarrollado con tecnologías modernas de Next.js y React, el cual funciona como la única interfaz pública expuesta a los usuarios en el puerto estándar 3000. Esta interfaz canaliza todas las peticiones y consultas de los analistas de salud pública mediante un proxy seguro implementado del lado del servidor, protegiendo así las credenciales y la lógica interna del sistema. 

Por debajo de la capa visual opera el motor central de orquestación y lógica basado en una instancia propia de n8n desplegada mediante contenedores. Este orquestador administra dos flujos de trabajo principales. El primero corresponde al workflow de ingesta automatizada de ejecución semanal y periódica, el cual realiza la descarga desatendida de los boletines oficiales en formato PDF publicados por el MINSA y el CDC, ejecuta peticiones concurrentes a la API de Open-Meteo para asociar las variables climáticas correspondientes a las coordenadas geográficas de afectación, y procesa la información de manera multimodal mediante los modelos de Google Gemini Flash para extraer un formato JSON altamente estructurado. Dicha información pasa posteriormente por rigurosas validaciones de esquemas antes de ser insertada de forma masiva en la base de datos relacional PostgreSQL, la cual se encuentra habilitada con la extensión de vectores pgvector. 

El segundo flujo corresponde al workflow de consulta inteligente en tiempo real, el cual interactúa con una interfaz de chat interactiva donde Google Gemini Flash realiza la conversión semántica del lenguaje natural ingresado por el usuario hacia sentencias SQL altamente seguras, permitiendo que el motor de PostgreSQL recupere el contexto histórico optimizado de manera inmediata.

## Arquitectura, Automatización y Pipelines de Integración Continua (CI/CD)

El ciclo de vida del código fuente está respaldado por un ecosistema de despliegue e integración continua altamente estructurado mediante GitHub Actions. Todos los flujos automatizados se ejecutan de manera aislada dentro de contenedores efímeros basados en la última distribución estable del sistema operativo Ubuntu, lo que garantiza la paridad absoluta de entornos de ejecución entre las estaciones locales de desarrollo y los servidores de prueba alojados en la nube.

La topología de la automatización se divide en tres pipelines especializados que operan de forma concurrente ante cada evento de solicitud de extracción o actualización en las ramas protegidas del repositorio:

* **Integración Continua del Frontend (frontend-ci.yml):** Este flujo tiene como objetivo asegurar que los componentes de la interfaz de usuario cumplan rigurosamente con los estándares de compilación y sintaxis. Para lograrlo, descarga el código fuente, configura el entorno de ejecución de Node.js, efectúa una instalación limpia y estricta utilizando el comando especializado npm ci —el cual obliga al uso obligatorio del archivo de bloqueo de versiones package-lock.json— y ejecuta el analizador estático ESLint con soporte para configuración plana y JSX, detectando cualquier anomalía antes de permitir el empaquetado final para producción.

* **Verificación Estructural de Automatizaciones (n8n-validate-ci.yml):** Este pipeline garantiza la integridad sintáctica y la validez formal de todos los flujos de trabajo, plantillas y archivos de configuración pertenecientes al orquestador n8n. Para ello, despliega un entorno independiente basado en intérpretes de Python, ejecutando validaciones recursivas masivas mediante el módulo nativo json.tool, lo que previene de manera eficaz fallos críticos en tiempo de ejecución causados por errores tipográficos o formaciones incorrectas en las estructuras de datos JSON.

* **Pruebas de Integración y Modelos de Inteligencia Artificial (ai-testing-ci.yml):** Este flujo valida los scripts experimentales, las pruebas unitarias enfocadas en la conectividad con los modelos de lenguaje y la consistencia general de los microservicios de consulta basados en inteligencia artificial.

### Control Inteligente de Rutas y Filtrado Condicional

Para maximizar la eficiencia en el consumo de recursos de la nube y eliminar por completo los bloqueos operativos en las reglas de protección de ramas, el sistema integra un mecanismo avanzado de filtrado condicional de directorios basado en la herramienta dorny/paths-filter. Al dispararse un evento de solicitud de extracción, el pipeline analiza de forma milimétrica qué rutas y directorios específicos han sido alterados en los commits recientes. 

Si se detectan modificaciones en el código fuente del frontend, el sistema activa de manera exclusiva las dependencias de Node.js, las pruebas de compilación y el linter. Si por el contrario se modifican los flujos de automatización y plantillas, se priorizan los validadores sintácticos de Python y las rutinas de análisis estático de seguridad para prevenir la exposición de credenciales o tokens. Si los cambios corresponden de manera exclusiva a documentación u otros elementos periféricos del repositorio, el pipeline omite de forma inteligente las tareas pesadas de compilación y emite un estado de aprobación instantáneo.

### Reglas de Protección de Ramas y Calidad Estricta

Para salvaguardar la estabilidad del entorno de producción en la rama principal, se aplican normativas de control inquebrantables. Ninguna rama de característica puede ser fusionada a menos que el cien por ciento de los estados devueltos por los workflows de GitHub Actions reporten éxito absoluto. Asimismo, todo el equipo de desarrollo se adhiere estrictamente a la especificación de mensajes estructurados bajo la norma de Conventional Commits, utilizando prefijos como feat para nuevas funcionalidades, fix para corrección de errores, ci para cambios en los flujos de integración, docs para documentación y build o chore para tareas de mantenimiento y dependencias, manteniendo así un historial sumamente limpio, legible y auditable.
## Guía Exhaustiva de Puesta en Marcha y Desarrollo Local

### 1. Clonación y Configuración Inicial del Repositorio
Para comenzar a trabajar en el proyecto, el primer paso consiste en clonar el repositorio oficial desde el servidor central utilizando la terminal de comandos:
```bash
git clone [https://github.com/Equipo5-App/HealthRadar.git](https://github.com/Equipo5-App/HealthRadar.git)
cd Celula5_HealthRadar