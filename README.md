# Estructura del Proyecto

En este commit se implementó la arquitectura general propuesta para el sistema,
creando la estructura base de carpetas y archivos que organizan cada capa del proyecto.

.github/ contiene la plantilla obligatoria para los Pull Requests y los flujos del n8n y las pruebas de IA.

src/frontend/ aloja el microfrontend, desacoplado de la lógica del negocio para
que evolucione de forma independiente.

src/n8n-workflows/ es el núcleo de orquestación del sistema, separando los flujos
estables de producción de los que están en fase de prueba.

src/database/ gestiona el sistema de base de datos mediante migraciones
numeradas secuencialmente y datos de prueba en los seeders.

src/ia-ops/ centraliza los prompts versionados y los scripts de QA para probar
los modelos.

infrastructure/ provee el Docker Compose y la plantilla de variables de entorno
para levantar todo el sistema localmente en segundos.