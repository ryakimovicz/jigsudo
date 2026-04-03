export const translations = {
  es: {
    app_title: "JIGSUDO",
    // Guide & Tutorial
    // Logic Labels
    label_click: "haz clic",
    label_touch: "toca",
    label_click_touch: "haz clic o toca",
    label_drag: "arrastra",
    label_place:
      "Haz clic en la pieza y luego en el tablero o arrástrala a su lugar",
    label_place_mobile: "Haz clic en la pieza y luego en el tablero",
    label_input_method: "con el pad en pantalla o el teclado",
    label_input_method_mobile: "con el pad en pantalla",

    // Tutorial Stages Detailed
    tutorial_stage_2_obj:
      "<strong>Objetivo:</strong> Coloca las piezas obtenidas para armar el tablero de Sudoku sin conflictos en filas ni columnas.",
    tutorial_stage_3_rules:
      "<strong>Reglas del Sudoku:</strong> No puede haber números repetidos en la misma fila, columna o bloque de 3x3.",
    tutorial_stage_3_btns:
      "<strong>Botones de ayuda:</strong> ↩️ Deshace el último cambio, ✏️ Activa el modo notas, 🗑️ Borra la celda (mantén presionado para limpiar todo).",
    tutorial_stage_3_kb:
      "<strong>Atajos de teclado:</strong> 1-9 (Ingresar), Q (Deshacer), W/N (Notas), E/Borrar (Limpiar), Esc (Deseleccionar).",

    guide_title: "Guía de Juego",
    guide_tab_general: "General",
    guide_tab_tutorial: "Tutorial",
    guide_intro_h: "¿Qué es Jigsudo?",
    guide_intro_p:
      "Jigsudo es un puzzle diario que combina memoria, lógica, rompecabezas y otros minijuegos. Tu objetivo es completar el tablero de Sudoku atravesando distintas etapas.",
    guide_controls_h: "Controles y Atajos",
    guide_pages_h: "Secciones",
    guide_page_home: "Acceso al puzzle diario y rankings.",
    guide_page_history:
      "Juega puzzles de días anteriores y consulta tus rachas.",
    guide_page_profile:
      "Gestiona tu perfil, sincronización en la nube y estadísticas personales.",
    guide_label_mouse: "Mouse / Táctil:",
    guide_control_mouse_desc: "Selecciona casillas, piezas o cartas.",
    guide_label_nums: "Teclas 1-9:",
    guide_control_nums_desc: "Ingresa números (1-9) en el Sudoku.",
    guide_label_undo: "Tecla Q:",
    guide_control_undo_desc: "Deshacer el último movimiento.",
    guide_label_notes: "Tecla W:",
    guide_control_notes_desc: "Activar/Desactivar modo notas.",
    guide_label_delete: "Tecla E / Borrar:",
    guide_control_delete_desc: "Limpiar la casilla seleccionada.",
    guide_label_esc: "Tecla Esc:",
    guide_control_esc_desc: "Cancelar selección o cerrar menús (Esc).",
    guide_mem_desc:
      "Encuentra los pares de bloques. Cada bloque es una sección 3x3 del Sudoku final.",
    guide_jig_desc:
      "Coloca los bloques encontrados en su posición correcta en el tablero 9x9.",
    guide_sudoku_desc:
      "Completa el tablero numérico siguiendo las reglas clásicas del Sudoku.",
    guide_peaks_desc:
      "Identifica los números mayores y menores respecto a sus vecinos.",
    guide_search_desc:
      "Encuentra las secuencias numéricas ocultas en el tablero.",
    guide_code_desc: "Revela y repite el patrón final de seguridad.",
    btn_start_tutorial: "Empezar Tutorial",
    btn_memorize: "Memorizar",
    tutorial_welcome_title: "Bienvenido",
    tutorial_welcome_desc:
      "Este tutorial te guiará por todas las etapas del juego con un tablero simplificado.",
    tutorial_stage_1_title: "Etapa 1: Juego de Memoria",
    tutorial_stage_1_desc:
      "<strong>Objetivo:</strong> Encuentra los pares de bloques 3x3. Cada bloque es una sección del Sudoku final.<br><strong>Controles:</strong> Haz clic en dos cartas para revelarlas. Usa el botón 'Memorizar' para echar un vistazo rápido.",
    tutorial_stage_2_title: "Etapa 2: Rompecabezas",
    tutorial_stage_2_desc:
      "{objective}<br><strong>Controles:</strong> {action}.",
    tutorial_stage_3_title: "Etapa 3: Sudoku",
    tutorial_stage_3_desc:
      "{rules}<br>{buttons}<br>{keyboard}<br><strong>Controles:</strong> Selecciona una celda e ingresa números {input_method}.",
    tutorial_stage_4_title: "Etapa 4: Picos y Valles",
    tutorial_stage_4_desc:
      "<strong>Objetivo:</strong> Identifica los números más altos (Picos) y más bajos (Valles) comparados con sus vecinos.<br><strong>Controles:</strong> {action} en la celda: se marcará en <strong>naranja</strong> si es un pico y en <strong>azul</strong> si es un valle.",
    tutorial_stage_5_title: "Etapa 5: Sopa de Números",
    tutorial_stage_5_desc:
      "<strong>Objetivo:</strong> Localiza las secuencias ocultas en el tablero. Pueden doblar en vertical u horizontal, pero no en diagonal.<br><strong>Controles:</strong> Haz clic y arrastra sobre las celdas que forman la secuencia completa.",
    tutorial_stage_6_title: "Etapa 6: El Código",
    tutorial_stage_6_desc:
      "<strong>Objetivo:</strong> Se revelará un patrón de seguridad. Memorízalo y repítelo exactamente en el tablero.<br><strong>Controles:</strong> {action} las celdas en el orden correcto.",
    tutorial_stage_7_title: "¡Tutorial Completado!",
    tutorial_stage_7_desc:
      "Felicidades, has dominado todas las mecánicas de Jigsudo. ¡Ya puedes enfrentarte al desafío de hoy!",
    btn_finish_tutorial: "Finalizar",

    header_profile_label: "Perfil",

    // Header Info
    date_locale: "es-ES" /* For date formatting logic */,

    // Generic
    soon: "(Próximamente)",

    // Sidebar
    sidebar_home: "Inicio",
    sidebar_history: "Historial",
    sidebar_how_to: "Guía",
    sidebar_info: "Info",
    sidebar_more_games: "Más Juegos",
    sidebar_close: "Cerrar",

    // Home Tabs
    tab_daily: "Diario",
    tab_custom: "Personalizado",

    // Custom Mode
    diff_easy: "Fácil",
    diff_normal: "Normal",
    diff_hard: "Difícil",
    diff_extreme: "Extremo",

    // Custom Tab Titles
    custom_difficulty: "Dificultad",
    custom_modes: "Niveles",

    // Game Names
    game_memory: "Juego de Memoria",
    game_jigsaw: "Rompe<wbr>cabezas",
    game_sudoku: "Sudoku",
    game_peaks: "Picos y Valles",
    game_search: "Sopa de Números",
    game_code: "El Código",

    // Menu Main Content
    menu_title: "Seis desafíos, un solo tablero",
    // innerHTML for description to preserve strong tags
    menu_description_html: `Todo empieza con el <strong>Juego de Memoria</strong>: encuentra los
            pares, consigue las piezas y arma el <strong>Rompe<wbr>cabezas</strong>.
            Solo así podrás enfrentar al <strong>Sudoku</strong>, superar los
            <strong>Picos y Valles</strong>, buscar en la <strong>Sopa de Números</strong> 
            y descifrar <strong>El Código</strong> final.`,
    menu_tagline: "Tu dosis diaria de números te está esperando",
    btn_start: "JUGAR",
    ranking_title: "Clasificación",
    rank_tab_daily: "Hoy",
    rank_tab_monthly: "Mes",
    rank_tab_all: "Siempre",
    rank_empty: "No hay datos todavía",
    btn_coming_soon: "PRÓXIMAMENTE",
    btn_solve: "Resolver",

    // Profile Dropdown
    profile_header: "Mí perfil",
    profile_dark_mode: "Modo Oscuro",
    profile_auto: "Automático",
    profile_settings: "Ajustes",
    profile_quick_clear: "Borrado Rápido",
    profile_language: "Idioma",
    profile_public: "Perfil Público",
    profile_private_msg: "Este perfil es privado",
    user_not_found: "Usuario no encontrado",
    privacy_title: "Política de Privacidad",
    terms_title: "Términos y Condiciones",
    settings_account: "Cuenta",
    settings_title: "Ajustes",
    menu_account: "Cuenta",
    header_account_label: "Menú de Cuenta",
    settings_appearance: "Apariencia",
    // New Keys
    theme_light: "Claro",
    theme_auto: "Auto",
    theme_dark: "Oscuro",
    setting_sound: "Sonido",
    setting_vibration: "Vibración",
    setting_confirm_clear: "Confirmar Borrado",
    greeting_prefix: "Hola,",
    // Static Pages Content
    about_title: "Sobre mí",
    about_intro_title: "Sobre Jigsudo",
    about_intro_p: "Jigsudo es un desafío mental diario que fusiona mecánicas de lógica, memoria, rompecabezas y otros minijuegos en una experiencia única. Cada día a las 06:00 UTC cambia el tablero para un nuevo reto, ofreciendo un momento de enfoque y entrenamiento inteligente directamente en tu navegador.",
    about_independent_title: "Un Proyecto Independiente",
    about_independent_text: "Este sitio es el resultado de la pasión por los acertijos y el desarrollo web. Fue creado íntegramente por <strong>Román Yakimovicz</strong> con el objetivo de ofrecer un juego gratuito, limpio y accesible al instante desde cualquier dispositivo.",
    about_vision_title: "Mi Filosofía",
    about_vision_text: "Entiendo los puzzles como una forma de ejercitar la mente y disfrutar del desafío lógico. Mi misión es puramente recreativa y busca ofrecer un refugio diario para desconectar del ruido cotidiano. Mantengo Jigsudo libre de publicidad intrusiva para que nada interrumpa tu concentración.",
    about_github_title: "Código Abierto",
    about_github_text: "Jigsudo es un proyecto transparente. Si eres desarrollador o tienes curiosidad por cómo funciona por dentro, puedes revisar todo el código fuente en GitHub.",
    
    privacy_intro_text: "Tu privacidad es importante. Esta Política de Privacidad explica cómo se recopila, utiliza y protege tu información cuando utilizas esta aplicación web.",
    privacy_sec1_h: "1. Información que se Recopila",
    privacy_sec1_sub1: "1.1. Autenticación y Perfil",
    privacy_sec1_p1: "Si decides crear una cuenta, se utiliza <strong>Google Firebase Authentication</strong> para gestionar tu inicio de sesión. Se recopila tu dirección de correo electrónico y un ID de usuario único para guardar tu progreso en la nube.",
    privacy_sec1_p2: "También se almacena tu nombre de usuario y tu preferencia de visibilidad del perfil (público o privado) en <strong>Google Firestore</strong>.",
    privacy_sec2_h: "2. Datos de Juego",
    privacy_sec2_p: "Se almacena tu progreso en las partidas (tiempos, puntuaciones, estado del tablero) para que puedas continuar desde cualquier dispositivo y participar en las clasificaciones.",
    privacy_sec2_p2: "Si mantienes tu perfil como público, tu nombre de usuario, rango y estadísticas básicas serán visibles para otros jugadores. Puedes cambiar esto a privado en cualquier momento.",
    privacy_sec3_h: "3. Cookies y Almacenamiento Local",
    privacy_sec3_p: "Se utiliza LocalStorage para guardar tus preferencias (Tema, Sonido, Vibración) y mantener tu sesión iniciada. Jigsudo no utiliza cookies de publicidad ni de rastreo de terceros.",
    privacy_sec4_h: "4. Donaciones y Servicios de Terceros",
    privacy_sec4_p: "Para el apoyo económico del proyecto, se utilizan plataformas externas como Ko-fi y Cafecito. Estos servicios tienen sus propias políticas de privacidad sobre cómo gestionan tus datos de pago.",
    privacy_sec5_h: "5. Tus Derechos",
    privacy_sec5_p1: "Tienes derecho a acceder, rectificar o eliminar tu información personal en cualquier momento desde la configuración de tu perfil.",
    support_title: "Apoya el Proyecto",
    support_desc: "Jigsudo es un proyecto independiente y siempre será gratuito. Si disfrutas del juego y quieres colaborar, puedes invitarme un café. No es obligatorio ni otorga ventajas, ¡pero lo agradezco mucho!",
    support_argentina: "Argentina (MP)",
    support_global: "Global (PayPal)",
    victory_support_p: "¿Te gustó la partida? Apoya el proyecto:",
    seo_faq_1_q: "¿Cuándo se actualiza el puzzle diario?",
    seo_faq_1_a: "El juego se actualiza y sincroniza para todo el mundo a las 06:00 UTC. Si no juegas en el día, perderás puntos de rango (RP) en el perfil y la tabla de clasificación debido a la inactividad.",
    seo_faq_2_q: "¿Es gratis jugar a Jigsudo?",
    seo_faq_2_a: "Sí, el puzzle diario es 100% gratuito.",
    seo_faq_3_q: "¿Puedo jugar puzzles de días anteriores?",
    seo_faq_3_a: "¡Sí! En la sección de <strong>Historial</strong> puedes acceder a los tableros de días pasados. Ten en cuenta que solo el puzzle del día actual cuenta para tu racha y para el ranking global.",
    seo_faq_4_q: "¿Qué ventajas tiene crear una cuenta?",
    seo_faq_4_a: "Al registrarte, tu progreso, estadísticas y racha se sincronizan automáticamente en la nube. Además, es necesario estar autenticado para aparecer en la tabla de clasificación y competir por los mejores rangos.",
    seo_faq_5_q: "¿Cómo funcionan las rachas?",
    seo_faq_5_a: "Para mantener tu racha, debes completar el desafío antes del próximo reset (06:00 UTC). Si dejas pasar un día sin jugar, la racha volverá a cero.",
    seo_faq_6_q: "¿Cómo se calculan los puntos de rango (RP)?",
    seo_faq_6_a: "El sistema premia la <strong>velocidad</strong> de resolución en todas las etapas y la <strong>precisión</strong> específicamente en el minijuego de Picos y Valles. Los puntos de rango (RP) se actualizan diariamente en el ranking global.",
    seo_faq_7_q: "¿Puedo jugar Jigsudo en mi celular?",
    seo_faq_7_a: "¡Totalmente! Jigsudo está diseñado para ser 100% responsiva (móvil y tablet). Puedes usarlo desde tu navegador e incluso añadirlo a tu pantalla de inicio.",
    seo_faq_8_q: "¿Jigsudo tiene anuncios o micro-pagos?",
    seo_faq_8_a: "Jigsudo no tiene micro-pagos y el acceso siempre será gratuito para todos. El proyecto se mantiene de forma independiente y sin publicidad. Las donaciones son opcionales, no otorgan ventajas competitivas, ¡pero las agradezco enormemente!",
    terms_intro_text: "Bienvenido a Jigsudo. Al acceder o utilizar este sitio web, aceptas cumplir con estos Términos y Condiciones. Si no estás de acuerdo con alguna parte, no deberías utilizar el servicio.",
    terms_sec1_h: "1. Descripción del Servicio",
    terms_sec1_p: "Jigsudo es una aplicación web gratuita de puzzles diarios. El proyecto es independiente y se mantiene mediante donaciones voluntarias.",
    terms_sec2_h: "2. Cuentas de Usuario",
    terms_sec2_p: "Para acceder a funciones como el ranking y el progreso en la nube, es necesario autenticarse. Eres responsable de la seguridad de tu cuenta.",
    terms_sec3_h: "3. Propiedad Intelectual",
    terms_sec3_p: "El código, diseño y logotipos de Jigsudo son propiedad exclusiva de Román Yakimovicz. Queda prohibida su reproducción o redistribución sin permiso.",
    terms_sec4_h: "4. Donaciones",
    terms_sec4_p: "Las donaciones son voluntarias, no obligatorias y no otorgan ventajas competitivas en el juego. Se procesan a través de proveedores externos y las agradezco de corazón.",
    terms_sec5_h: "5. Prohibiciones",
    terms_sec5_p: "Queda estrictamente prohibido: copiar, modificar, distribuir o realizar ingeniería inversa del código; utilizar bots o herramientas automatizadas; e intentar extraer datos de la aplicación.",
    terms_sec6_h: "6. Limitación de Responsabilidad",
    terms_sec6_p: "El servicio se proporciona 'tal cual'. No se garantiza que sea ininterrumpido o libre de errores. No se asume responsabilidad por daños derivados del uso del servicio.",

    // Footer
    footer_rights_html:
      '© 2026 <a href="https://github.com/ryakimovicz/jigsudo" target="_blank">Román Yakimovicz</a>',
    footer_about: "Sobre mí",
    footer_privacy: "Privacidad",
    footer_terms: "Términos",
    footer_support: "Soporte",
    contact_talk_title: "Hablemos",
    contact_talk_p1: "¿Tienes sugerencias, encontraste un error, o simplemente quieres dejarme tus comentarios sobre Jigsudo? Estaré encantado de leerte.",
    contact_talk_p2: "Puedes ponerte en contacto directamente conmigo creando un reporte en mi repositorio de soporte en GitHub:",
    contact_github_btn: "🛠️ Soporte y Sugerencias en GitHub",
    contact_talk_p3: "Allí podrás abrir un 'Issue' (reporte) y te responderé a la brevedad.",

    // History (Historial)
    history_title: "Historial de Puzzles",
    history_select_date: "Selecciona una fecha para jugar",
    hist_legend_title: "Referencias",
    hist_legend_nav: "Usa las flechas para navegar entre los meses disponibles.",
    hist_legend_gray: "Jigsudo no jugado en su día original.",
    hist_legend_yellow: "Jigsudo iniciado pero no terminado en su día.",
    hist_legend_green: "Jigsudo terminado en su día original.",
    hist_legend_crown: "Jigsudo terminado (en su día o posteriormente).",

    // Memory Game Help
    memory_help_title: "Cómo jugar",
    memory_help_desc:
      "Encuentra los pares de bloques sudoku.<br />Cada par revelado se colocará en el tablero o en tu colección.",

    // Jigsaw Game Help
    jigsaw_help_title: "Cómo jugar", // Standardized
    jigsaw_help_desc:
      "Arrastra las piezas de tu colección al tablero.<br />Arma el Sudoku completo para avanzar.",
    sudoku_help_title: "Cómo jugar", // Standardized
    sudoku_help_desc:
      "Completa la cuadrícula con los números del 1 al 9.<br />Cada fila, columna y bloque de 3x3 debe contener todos los números sin repetirlos.",
    alert_next_sudoku: "Siguiente juego: Sudoku\nPróximamente",
    alert_next_peaks: "Siguiente juego: Picos y Valles\nPróximamente",
    alert_next_search: "Siguiente juego: Sopa de Números\nPróximamente",
    sudoku_key_completed: "Este número ya se ha usado 9 veces.",
    
    // Guide Scoring (Spanish)
    guide_intro_title: "🎮 Bienvenido a Jigsudo",
    guide_intro_p1: "Jigsudo es una mezcla única de rompecabezas, memoria y lógica. Si eres nuevo, te recomendamos completar nuestro tutorial.",
    guide_btn_start_tutorial: "🚀 Iniciar Tutorial",
    guide_btn_skip_tutorial: "Omitir tutorial",

    guide_scoring_title: "📊 Sistema de Puntos (RP)",
    guide_scoring_p1: "Cada juego otorga puntos base (RP) al completarlo. Además, puedes ganar bonificaciones por velocidad y consistencia.",
    guide_base_rp: "Base RP",
    guide_base_rp_desc: "6.0 puntos garantizados por terminar.",
    guide_speed: "Velocidad",
    guide_speed_desc: "Tienes un bono de hasta 10 Puntos que decae durante los primeros 60 minutos. ¡Sé rápido!",
    guide_penalty: "Penalización",
    guide_penalty_desc: "En Picos y Valles, -0.5 RP por cada error. La precisión es clave.",
    guide_streak: "Racha Diaria",
    guide_streak_desc: "Juega todos los días para demostrar tu constancia.",
    guide_absence: "Ausencia",
    guide_absence_desc: "-10.0 RP por cada día sin jugar.",
    guide_ranks_title: "🏆 Sistema de Rangos",
    guide_ranks_p1: "Acumula RP para subir de nivel y desbloquear nuevos rangos. Cada rango representa tu maestría en Jigsudo.",

    // UI Labels (Spanish)
    label_level_prefix: "Nivel",
    label_peaks_remaining: "Faltan",
    label_peaks_errors: "Errores",
    label_peak: "Pico",
    label_valley: "Valle",
    btn_next_tip: "Siguiente",
    btn_prev_tip: "Anterior",

    // Search Game Help
    search_help_title: "Cómo jugar", // Standardized
    search_help_desc:
      "Encuentra las secuencias numéricas ocultas en el tablero.<br>Pueden girar en cualquier dirección (como viborita), pero no en diagonal.",

    // Modals
    modal_clear_title: "Reiniciar Tablero",
    modal_clear_body:
      "¿Estás seguro de que quieres borrar todos los números del tablero?",
    modal_dont_ask: "No volver a preguntar",
    btn_cancel: "Cancelar",
    btn_clear: "Borrar Todo",

    // Peaks Game Help
    peaks_help_title: "Cómo jugar", // Standardized
    peaks_help_desc:
      "Encuentra los <strong>Picos</strong> (números mayores que todos sus vecinos) y los <strong>Valles</strong> (números menores que todos sus vecinos).",

    peaks_errors: "Errores:",
    peaks_remaining: "Faltan:",
    peaks_tooltip_peak: "Pico",
    peaks_tooltip_valley: "Valle",

    // Search
    search_targets_title: "Secuencias:",
    // Code Game
    game_code: "El Código",
    code_help_title: "Cómo jugar", // Standardized
    code_help_desc:
      "Memoriza la secuencia numérica y repítela en las celdas correctas.<br>La secuencia crece en cada turno.",
    code_level_local: "Nivel",
    code_win: "¡CÓDIGO DESCIFRADO!",

    // Authentication
    login_title: "Cuenta Jigsudo",
    btn_login: "Iniciar Sesión",
    btn_login_menu: "Iniciar Sesión",
    btn_logout: "Cerrar Sesión",
    btn_change_password: "Cambiar Contraseña",
    btn_change_username: "Cambiar Nombre",
    btn_delete_account: "Eliminar Cuenta",
    btn_register: "Crear Cuenta",
    link_register: "Regístrate",
    link_login: "Inicia Sesión",
    btn_google_login: "Continuar con Google",
    auth_or: "o",
    auth_success: "¡Bienvenido!",
    auth_logout: "Sesión cerrada",
    guest: "Anónimo",
    guest_profile_desc:
      "Inicia sesión para guardar tu progreso y aparecer en el ranking.",
    user_default: "Usuario",
    aria_show_password: "Mostrar contraseña",
    auth_email_placeholder: "Email",
    auth_password_placeholder: "Contraseña",
    auth_no_account: "¿No tienes cuenta?",
    auth_have_account: "¿Ya tienes cuenta?",
    auth_username_placeholder: "Nombre de usuario",
    auth_password_hint_placeholder: "Contraseña (mín. 6 caracteres)",
    auth_repeat_password_placeholder: "Repetir Contraseña",
    auth_confirm_pwd_desc: "Para continuar, ingresa tu contraseña actual.",
    auth_new_value_placeholder: "Nuevo valor",
    auth_reset_pw_title: "Recuperar Contraseña",
    auth_reset_pw_desc:
      "Ingresa tu correo para recibir un enlace de recuperación.",
    auth_forgot_password: "¿Olvidaste tu contraseña?",

    // Auth Modals & Toasts
    modal_change_name_title: "Cambiar Nombre",
    modal_change_name_desc: "Ingresa tu nuevo nombre de usuario.",
    modal_new_name_placeholder: "Nuevo nombre",
    modal_change_pw_title: "Cambiar Contraseña",
    modal_change_pw_desc: "Ingresa tu contraseña actual y la nueva.",
    modal_delete_account_title: "Eliminar Cuenta",
    modal_delete_account_desc:
      "⚠️ Esta acción es IRREVERSIBLE. Ingresa tu contraseña para confirmar.",
    modal_delete_account_google_desc:
      "⚠️ Esta acción es IRREVERSIBLE. Haz clic en Confirmar para re-autenticar con Google.",

    modal_logout_title: "Cerrar Sesión",
    modal_logout_desc: "¿Estás seguro de que deseas salir?",

    modal_delete_confirm_title: "⚠️ Última Advertencia",
    modal_delete_confirm_desc:
      "Se borrará <b>todo tu progreso, estadísticas y ranking</b> para siempre. Esta acción no se puede deshacer.",

    btn_confirm: "Confirmar",
    btn_saving: "Guardando...",
    btn_processing: "Procesando...",
    btn_deleting: "Borrando...",
    btn_delete_all: "Borrar Todo",
    btn_exiting: "Saliendo...",
    err_auth_email_in_use: "El correo ya está registrado.",
    err_auth_invalid_email: "Correo inválido.",
    err_auth_weak_password: "La contraseña es muy débil (mínimo 6 caracteres).",
    err_auth_user_not_found: "Usuario no encontrado.",
    err_auth_wrong_password: "Contraseña incorrecta.",
    err_auth_too_many_requests: "Demasiados intentos. Intenta más tarde.",
    err_auth_unauthorized_domain: "Dominio no autorizado para Google Login.",
    err_auth_popup_closed:
      "La ventana de inicio de sesión se cerró antes de completar el proceso.",
    err_auth_cancelled_popup:
      "Ya hay una solicitud de inicio de sesión en curso. Por favor, espera.",
    err_auth_popup_blocked:
      "El navegador bloqueó la ventana de inicio de sesión. Por favor, permite los popups para este sitio.",
    err_auth_general: "Error de autenticación: ",
    err_user_exists: "El nombre de usuario ya está en uso.",

    sidebar_history: "Historial",
    history_title: "Historial de Puzzles",
    history_select_date: "Selecciona una fecha para jugar",
    toast_email_invalid: "El correo no es válido.",
    toast_name_empty: "El nombre no puede estar vacío.",
    error_missing_puzzle: "No hay partida disponible para este día.",
    error_missing_puzzle_day: "No hay partida disponible para el día {day}.",

    toast_name_empty: "El nombre no puede estar vacío.",
    toast_name_success: "Nombre actualizado con éxito.",
    toast_pw_empty: "Completa todos los campos.",
    toast_pw_mismatch: "Las contraseñas nuevas no coinciden.",
    toast_pw_short: "La nueva contraseña debe tener al menos 6 caracteres.",
    toast_pw_success: "Contraseña actualizada con éxito.",
    toast_pw_enter: "Ingresa tu contraseña.",
    toast_delete_success: "Cuenta eliminada correctamente.",
    toast_reset_sent:
      "Correo de recuperación enviado. Revisa tu bandeja de entrada.",
    toast_verification_sent: "Correo de verificación enviado.",
    toast_verification_too_many:
      "Ya enviamos un mail recientemente. Por favor, espera un minuto antes de pedir otro.",
    btn_verify_now: "Verificar ahora",
    modal_reg_success_title: "¡Registro Exitoso! 🥳",
    modal_reg_success_body:
      "Te hemos enviado un correo de verificación. Por favor, revisa tu bandeja de entrada (y la carpeta de spam) para activar todas las funciones.",
    modal_reg_benefits_title: "Beneficios de verificar:",
    benefit_ranking: "Aparecer en el Ranking Global",
    benefit_cloud: "Guardado en la Nube automático",
    btn_go_to_email: "Ir a %%provider%%",
    btn_go_to_generic_email: "Abrir mi Correo",
    btn_change_email: "Cambiar Email",
    toast_email_change_sent:
      "Se ha enviado un enlace de confirmación a tu nuevo correo. El cambio se completará cuando hagas clic en él.",
    toast_logout_success: "Sesión cerrada correctamente.",
    toast_logout_error: "Error al cerrar sesión: ",

    // Placeholders
    placeholder_current_pw: "Contraseña actual",
    placeholder_new_email: "Nuevo correo electrónico",
    placeholder_new_pw: "Nueva contraseña (mín 6 caracteres)",
    placeholder_verify_pw: "Repetir nueva contraseña",

    // Profile Stats (Spanish)
    profile_title_page: "Mi Perfil",
    btn_view_profile: "Ver Perfil",
    stat_days: "Jigsudos Completados",
    stat_streak: "Racha Actual",
    stat_streak_short: "Racha",
    stat_daily: "Hoy",
    stat_max_streak: "Racha Máx.",
    stat_max_score: "Puntaje Máx.",
    stat_best_time: "Tiempo Récord",
    stat_avg_time: "Tiempo Prom.",
    stat_avg_time: "Tiempo Promedio",
    stat_points: "Puntos",
    stats_details_title: "Tiempos promedio por nivel",
    daily_avg_title: "Promedio Diario",
    stats_title: "Estadísticas",
    sc_invite_msg: "¡Desafía tu mente en el puzzle diario!",
    no_data: "Sin datos suficientes",

    // Victory Summary
    victory_title: "¡Juego Completado!",
    victory_desc: "Aquí tienes un resumen de tu partida de hoy.",
    victory_stat_time: "Tiempo Total",
    victory_stat_streak: "Racha Actual",
    victory_stat_errors: "Errores",
    victory_stat_score: "Puntaje",
    victory_times_breakdown: "Tiempos por nivel",
    btn_back_home: "Volver al Inicio",
    btn_view_results: "Ver Resultado",
    btn_share_result: "Compartir Resultado",
    victory_share_title: "DESAFÍO COMPLETADO",
    btn_close: "Cerrar",

    ranking_you: "(Tú)",
    ranking_col_user: "Usuario",
    ranking_col_points: "Puntos",

    stage_names: {
      memory: "Memoria",
      jigsaw: "Rompecabezas",
      sudoku: "Sudoku",
      peaks: "Picos",
      search: "Sopa",
      code: "Código",
    },

    // Ranks (Spanish)
    rank_0: "Novato",
    rank_1: "Principiante",
    rank_2: "Aficionado",
    rank_3: "Estudiante",
    rank_4: "Analista",
    rank_5: "Lógico",
    rank_6: "Estratega",
    rank_7: "Veterano",
    rank_8: "Experto",
    rank_9: "Maestro",
    rank_10: "Sabio",
    rank_11: "Erudito",
    rank_12: "Visionario",
    rank_13: "Iluminado",
    rank_14: "Oráculo",
    rank_15: "Eterno",
    rank_level_prefix: "Nvl.",

    // Minigame Names for Profile (Spanish)
    p_game_memory: "Juego de Memoria",
    p_game_jigsaw: "Rompe<wbr>cabezas",
    p_game_sudoku: "Sudoku",
    p_game_peaks: "Picos y Valles",
    p_game_search: "Sopa de Números",
    p_game_code: "El Código",

    // Support & Share
    share_text:
      "¡Desafía tu mente con Jigsudo! 🧩✨ ¿Podrás resolver el puzzle del día?",
    toast_share_success: "¡Enlace copiado al portapapeles! 📋✨",

    // Stats Sharing
    btn_share_stats: "Compartir Estadísticas",
    share_stats_msg: "¡Mira mi progreso en Jigsudo! 🧩✨",

    // SEO/Home Info
    seo_title: "El Desafío Jigsudo: Entrena tu mente cada día",
    seo_summary: "¿Qué es Jigsudo?",
    seo_summary_text:
      "Jigsudo es un desafío mental diario que fusiona mecánicas de Sudoku, Memoria y Rompecabezas y otros minijuegos en un único tablero inteligente. Cada día a las 06:00 UTC cambia el tablero para un nuevo reto. Desde encontrar pares en el Juego de Memoria hasta descifrar El Código, el juego te guía por seis etapas interconectadas que pondrán a prueba tu razonamiento.",
    seo_benefits: "¿Por qué resolver puzzles de lógica?",
    seo_benefits_text:
      "Resolver acertijos y puzzles de lógica es una forma fantástica de ejercitar la mente mientras te diviertes. Jigsudo te ofrece un espacio para poner a prueba tu paciencia y razonamiento personal de una manera envolvente. Algunos de los motivos para aceptar el desafío son:",
    seo_benefit_1:
      "Entretenimiento con propósito: Cada etapa es un nuevo reto mental único.",
    seo_benefit_2:
      "Enfoque y paciencia: La lógica de todos los minijuegos exige concentración y calma.",
    seo_benefit_3:
      "Desconexión del estrés: Sumergirte en el juego actúa como una 'meditación activa' para tu día.",
    seo_ranking: "Sube en el Ranking Global",
    seo_ranking_text:
      "Al crear una cuenta, puedes medir tu destreza contra jugadores de todo el mundo. Jigsudo cuenta con un sistema de puntos de rango (RP) que penaliza la inactividad y recompensa la velocidad y la precisión. ¡No faltes a tu cita diaria y alcanza el rango Galáctico!",
  },
  en: {
    app_title: "JIGSUDO",
    // Guide & Tutorial
    // Logic Labels
    label_click: "click",
    label_touch: "tap",
    label_click_touch: "click or tap",
    label_drag: "drag",
    label_place:
      "click the piece and then the board position, or drag it to its spot",
    label_place_mobile: "click the piece and then the board position",
    label_input_method: "with the on-screen pad or keyboard",
    label_input_method_mobile: "with the on-screen pad",

    // Tutorial Stages Detailed
    tutorial_stage_2_obj:
      "<strong>Objective:</strong> Place the collected pieces to build the Sudoku board without conflicts in rows or columns.",
    tutorial_stage_3_rules:
      "<strong>Sudoku Rules:</strong> No numbers can be duplicated in the same row, column, or 3x3 block.",
    tutorial_stage_3_btns:
      "<strong>Action buttons:</strong> ↩️ Undoes the last change, ✏️ Toggles pencil (notes) mode, 🗑️ Clears the cell (long press to clear board).",
    tutorial_stage_3_kb:
      "<strong>Keyboard Shortcuts:</strong> 1-9 (Input), Q (Undo), W/N (Notes), E/Backspace (Clear), Esc (Deselect).",

    guide_title: "Game Guide",
    guide_tab_general: "General",
    guide_tab_tutorial: "Tutorial",
    guide_intro_h: "What is Jigsudo?",
    guide_intro_p:
      "Jigsudo is a daily puzzle that combines memory, logic, jigsaw, and other mini-games. Your goal is to complete the Sudoku board through different stages.",
    guide_controls_h: "Controls and Shortcuts",
    guide_pages_h: "Sections",
    guide_page_home: "Access the daily puzzle and rankings.",
    guide_page_history:
      "Play puzzles from previous days and check your streaks.",
    guide_page_profile: "Manage your profile, cloud sync, and personal stats.",
    guide_label_mouse: "Mouse / Touch:",
    guide_control_mouse_desc: "Select cells, pieces, or cards.",
    guide_label_nums: "Keys 1-9:",
    guide_control_nums_desc: "Input numbers (1-9) in the Sudoku.",
    guide_label_undo: "Key Q:",
    guide_control_undo_desc: "Undo the last movement.",
    guide_label_notes: "Key W:",
    guide_control_notes_desc: "Toggle pencil mode (Notes).",
    guide_label_delete: "Key E / Clear:",
    guide_control_delete_desc: "Clear the selected cell.",
    guide_label_esc: "Key Esc:",
    guide_control_esc_desc: "Cancel selection or close menus (Esc).",
    guide_mem_desc:
      "Find the pairs of blocks. Each block is a 3x3 section of the final Sudoku.",
    guide_jig_desc:
      "Place the found blocks in their correct position on the 9x9 board.",
    guide_sudoku_desc:
      "Complete the numeric board following the classic rules of Sudoku.",
    guide_peaks_desc:
      "Identify the higher and lower numbers relative to their neighbors.",
    guide_search_desc: "Find the hidden numeric sequences on the board.",
    guide_code_desc: "Reveal and repeat the final security pattern.",
    btn_start_tutorial: "Start Tutorial",
    btn_memorize: "Memorize",
    tutorial_welcome_title: "Welcome",
    tutorial_welcome_desc:
      "This tutorial will guide you through all stages of the game with a simplified board.",
    tutorial_stage_1_title: "Stage 1: Memory Game",
    tutorial_stage_1_desc:
      "<strong>Goal:</strong> Find the 3x3 block pairs. Each block is a section of the final Sudoku.<br><strong>Controls:</strong> Click two cards to reveal them. Use 'Memorize' for a quick peek.",
    tutorial_stage_2_title: "Stage 2: Jigsaw",
    tutorial_stage_2_desc:
      "{objective}<br><strong>Controls:</strong> {action}.",
    tutorial_stage_3_title: "Stage 3: Sudoku",
    tutorial_stage_3_desc:
      "{rules}<br>{buttons}<br>{keyboard}<br><strong>Controls:</strong> Select a cell and input numbers {input_method}.",
    tutorial_stage_4_title: "Stage 4: Peaks and Valleys",
    tutorial_stage_4_desc:
      "<strong>Goal:</strong> Identify the highest (Peaks) and lowest (Valleys) numbers compared to their neighbors.<br><strong>Controls:</strong> {action} the cell: it marks <strong>orange</strong> for a peak and <strong>blue</strong> for a valley.",
    tutorial_stage_5_title: "Stage 5: Number Search",
    tutorial_stage_5_desc:
      "<strong>Goal:</strong> Locate the hidden sequences on the board. They can turn vertically or horizontally, but not diagonally.<br><strong>Controls:</strong> Click and drag over the cells that form the sequence.",
    tutorial_stage_6_title: "Stage 6: The Code",
    tutorial_stage_6_desc:
      "<strong>Goal:</strong> A security pattern will be revealed. Memorize and repeat it exactly on the board.<br><strong>Controls:</strong> {action} the cells in the correct order.",
    tutorial_stage_7_title: "Tutorial Completed!",
    tutorial_stage_7_desc:
      "Congratulations, you've mastered Jigsudo! You're ready for today's challenge.",
    btn_finish_tutorial: "Finish",

    header_profile_label: "Profile",

    // Header Info
    date_locale: "en-US",

    // Generic
    soon: "(Coming Soon)",

    // Sidebar
    sidebar_home: "Home",
    sidebar_history: "History",
    sidebar_how_to: "Guide",
    sidebar_info: "Info",
    sidebar_more_games: "More Games",
    sidebar_close: "Close",

    // Home Tabs
    tab_daily: "Daily",
    tab_custom: "Custom",

    // Custom Mode
    diff_easy: "Easy",
    diff_normal: "Normal",
    diff_hard: "Hard",
    diff_extreme: "Extreme",

    // Custom Tab Titles
    custom_difficulty: "Difficulty",
    custom_modes: "Levels",

    // Game Names
    game_memory: "Memory Game",
    game_jigsaw: "Jigsaw Puzzle",
    game_sudoku: "Sudoku",
    game_peaks: "Peaks and Valleys",
    game_search: "Number Search",
    game_code: "The Code",

    // Menu Main Content
    menu_title: "Six challenges, one single board",
    menu_description_html: `It all starts with the <strong>Memory Game</strong>: find the 
            pairs, get the pieces and solve the <strong>Jigsaw Puzzle</strong>.
            Only then can you face the <strong>Sudoku</strong>, overcome the 
            <strong>Peaks and Valleys</strong>, search in the <strong>Number Search</strong> 
            and crack <strong>The Code</strong> at the end.`,
    menu_tagline: "Your daily dose of numbers is waiting for you",
    btn_start: "PLAY",
    ranking_title: "Leaderboard",
    rank_tab_daily: "Today",
    rank_tab_monthly: "Month",
    rank_tab_all: "All Time",
    rank_empty: "No data yet",
    btn_coming_soon: "COMING SOON",
    btn_solve: "Solve",

    // Profile Dropdown
    profile_header: "My Profile",
    profile_dark_mode: "Dark Mode",
    profile_auto: "Automatic",
    profile_settings: "Settings",
    profile_quick_clear: "Quick Clear",
    profile_language: "Language",
    profile_public: "Public Profile",
    profile_private_msg: "This profile is private",
    user_not_found: "User not found",
    privacy_title: "Privacy Policy",
    terms_title: "Terms and Conditions",
    // Footer
    footer_rights_html:
      '© 2026 <a href="https://github.com/ryakimovicz/jigsudo" target="_blank">Román Yakimovicz</a>',
    footer_about: "About Me",
    footer_privacy: "Privacy",
    footer_terms: "Terms",
    footer_support: "Support",
    contact_talk_title: "Let's Talk",
    contact_talk_p1: "Got suggestions, found a bug, or just want to leave feedback? I'd love to hear from you.",
    contact_talk_p2: "You can get in touch with me directly by creating a report on my GitHub support repository:",
    contact_github_btn: "🛠️ Support and Suggestions on GitHub",
    contact_talk_p3: "There you can open an 'Issue' and I'll get back to you as soon as possible.",

    // History
    history_title: "Puzzle History",
    history_select_date: "Select a date to play",
    hist_legend_title: "History Guide",
    hist_legend_nav: "Use the arrows to navigate through available months.",
    hist_legend_gray: "Jigsudo not played on its original day.",
    hist_legend_yellow: "Jigsudo started but not finished on its day.",
    hist_legend_green: "Jigsudo finished on its original day.",
    hist_legend_crown: "Jigsudo finished (on its day or later).",

    // Memory Game Help
    memory_help_title: "How to play",
    memory_help_desc:
      "Find the matching Sudoku block pairs.<br />Each revealed pair will be placed on the board or in your collection.",

    // Jigsaw Game Help
    jigsaw_help_title: "How to play", // Standardized
    jigsaw_help_desc:
      "Drag pieces from your collection to the board.<br />Assemble the full Sudoku to proceed.",
    sudoku_help_title: "How to play", // Standardized
    sudoku_help_desc:
      "Complete the grid with numbers from 1 to 9.<br />Each row, column and 3x3 block must contain all numbers without repeating them.",
    alert_next_sudoku: "Next game: Sudoku\nComing Soon",
    alert_next_peaks: "Next game: Peaks & Valleys\nComing Soon",
    alert_next_search: "Next game: Number Search\nComing Soon",

    // Search Game Help
    search_help_title: "How to play", // Standardized
    search_help_desc:
      "Find the hidden number sequences on the board.<br>They can turn in any direction (like a snake), but not diagonally.",
    search_targets_title: "Sequences:", // [NEW]

    // Modals
    modal_clear_title: "Reset Board",
    modal_clear_body:
      "Are you sure you want to clear all numbers from the board?",
    settings_title: "Settings",
    settings_account: "Account",
    menu_account: "Account",
    header_account_label: "Account Menu",
    settings_appearance: "Appearance",
    settings_gameplay: "Gameplay",
    // New Keys
    theme_light: "Light",
    theme_auto: "Auto",
    theme_dark: "Dark",
    setting_sound: "Sound",
    setting_vibration: "Vibration",
    setting_confirm_clear: "Confirm Clear",
    greeting_prefix: "Hello,",
    // Static Pages Content
    about_intro_title: "About Jigsudo",
    about_intro_p: "Jigsudo is a daily mental challenge that merges mechanics from logic, memory, jigsaw, and other mini-games into a unique experience. Every day at 06:00 UTC, the board changes for a new challenge, offering a moment of focus and smart training directly in your browser.",
    about_independent_title: "An Independent Project",
    about_independent_text: "This site is the result of a passion for puzzles and web development. It was created entirely by <strong>Román Yakimovicz</strong> with the goal of offering a free, clean game that is instantly accessible from any device.",
    about_vision_title: "My Philosophy",
    about_vision_text: "I see puzzles as a way to exercise the mind and enjoy a logical challenge. My mission is recreational, seeking to offer a daily refuge to disconnect from everyday noise. I keep Jigsudo ad-free so nothing interrupts your concentration.",
    about_github_title: "Open Source",
    about_github_text: "Jigsudo is a transparent project. If you are a developer or curious about how it works inside, you can review all the source code on GitHub.",
    
    privacy_intro_text: "Your privacy is important. This Privacy Policy explains how your information is collected, used, and protected when you use this web application.",
    privacy_sec1_h: "1. Information Collected",
    privacy_sec1_sub1: "1.1. Authentication and Profile",
    privacy_sec1_p1: "If you choose to create an account, <strong>Google Firebase Authentication</strong> is used to manage your login. Your email address and a unique user ID are collected to save your progress in the cloud.",
    privacy_sec1_p2: "Your username and profile visibility preference (public or private) are also stored in <strong>Google Firestore</strong>.",
    privacy_sec2_h: "2. Game Data",
    privacy_sec2_p: "Your game progress (times, scores, board state) is stored so you can continue from any device and participate in global rankings.",
    privacy_sec2_p2: "If you keep your profile public, your username, rank, and basic stats will be visible to other players. You can change this to private at any time.",
    privacy_sec3_h: "3. Cookies and Local Storage",
    privacy_sec3_p: "LocalStorage is used to save your preferences (Theme, Sound, Vibration) and keep your session active. Jigsudo does not use advertising or third-party tracking cookies.",
    privacy_sec4_h: "4. Donations and Third-Party Services",
    privacy_sec4_p: "For financial support of the project, external platforms such as Ko-fi and Cafecito are used. These services have their own privacy policies regarding how they handle your payment data.",
    privacy_sec5_h: "5. Your Rights",
    privacy_sec5_p1: "You have the right to access, rectify, or delete your personal information at any time from your profile settings.",
    support_title: "Support the Project",
    support_desc: "Jigsudo is an independent project and will always be free. If you enjoy the game and want to collaborate, you can buy me a coffee. It’s not mandatory and doesn't grant any advantage, but I truly appreciate it!",
    support_argentina: "Argentina (MP)",
    support_global: "Global (PayPal)",
    victory_support_p: "Did you enjoy the game? Support the project:",
    seo_faq_1_q: "When is the daily puzzle updated?",
    seo_faq_1_a: "The game updates and syncs for everyone at 06:00 UTC. If you don't play during the day, you will lose Rank Points (RP) in your profile and the leaderboard due to inactivity.",
    seo_faq_2_q: "Is Jigsudo free to play?",
    seo_faq_2_a: "Yes, the daily puzzle is 100% free.",
    seo_faq_3_q: "Can I play puzzles from previous days?",
    seo_faq_3_a: "Yes! In the <strong>History</strong> section, you can access boards from past days. Keep in mind that only the current day's puzzle counts towards your streak and the global ranking.",
    seo_faq_4_q: "What are the benefits of creating an account?",
    seo_faq_4_a: "By registering, your progress, statistics, and streak are automatically synced to the cloud. Additionally, authentication is required to appear on the leaderboard and compete for the best ranks.",
    seo_faq_5_q: "How do streaks work?",
    seo_faq_5_a: "To maintain your streak, you must complete the challenge before the next reset (06:00 UTC). If you miss a day without playing, your streak will return to zero.",
    seo_faq_6_q: "How are Rank Points (RP) calculated?",
    seo_faq_6_a: "The system rewards <strong>speed</strong> in solving all stages and <strong>accuracy</strong> specifically in the Peaks & Valleys mini-game. Rank Points (RP) are updated daily on the global ranking.",
    seo_faq_7_q: "Can I play Jigsudo on my phone?",
    seo_faq_7_a: "Absolutely! Jigsudo is designed to be 100% responsive (mobile and tablet). You can use it from your browser and even add it to your home screen.",
    seo_faq_8_q: "Does Jigsudo have ads or micro-payments?",
    seo_faq_8_a: "Jigsudo has no micro-payments and access will always be free for everyone. The project is maintained independently and without ads. Donations are optional, do not grant competitive advantages, but I truly appreciate them!",
    terms_intro_text: "Welcome to Jigsudo. By accessing or using this website, you agree to comply with these Terms and Conditions. If you do not agree with any part, you should not use the service.",
    terms_sec1_h: "1. Description of Service",
    terms_sec1_p: "Jigsudo is a free web application for daily puzzles. The project is independent and maintained through voluntary donations.",
    terms_sec2_h: "2. User Accounts",
    terms_sec2_p: "To access features like rankings and cloud progress, authentication is required. You are responsible for the security of your account.",
    terms_sec3_h: "3. Intellectual Property",
    terms_sec3_p: "The code, design, and logos of Jigsudo are the exclusive property of Román Yakimovicz. Reproduction or redistribution without permission is prohibited.",
    terms_sec4_h: "4. Donations",
    terms_sec4_p: "Donations are voluntary, not mandatory, and do not grant competitive advantages in the game. They are processed through third-party providers and I truly appreciate them.",
    terms_sec5_h: "5. Prohibitions",
    terms_sec5_p: "It is strictly prohibited to: copy, modify, distribute, or reverse engineer the code; use bots or automated tools; and attempt to extract data from the application.",
    terms_sec6_h: "6. Limitation of Liability",
    terms_sec6_p: "The service is provided 'as is'. No guarantee is made that it will be uninterrupted or error-free. No liability is assumed for damages arising from the use of the service.",
    modal_dont_ask: "Don't ask again",
    btn_cancel: "Cancel",
    btn_clear: "Clear All",

    // Peaks Game Help
    peaks_help_title: "How to play", // Standardized
    peaks_help_desc:
      "Find the <strong>Peaks</strong> (numbers with no larger neighbors around them) and <strong>Valleys</strong> (numbers with no smaller neighbors around them).",

    peaks_errors: "Errors:",
    peaks_remaining: "Remaining:",
    peaks_tooltip_peak: "Peak",
    peaks_tooltip_valley: "Valley",
    // Code Game
    game_code: "The Code",
    code_help_title: "How to play", // Standardized
    code_help_desc:
      "Memorize the number sequence and repeat it on the correct cells.<br>The sequence grows each turn.",
    code_level_local: "Level",
    code_win: "CODE CRACKED!",
    sudoku_key_completed: "This number has already been used 9 times.",

    // Guide Scoring (English)
    guide_intro_title: "🎮 Welcome to Jigsudo",
    guide_intro_p1: "Jigsudo is a unique blend of puzzles, memory, and logic. If you're new, we recommend completing our tutorial.",
    guide_btn_start_tutorial: "🚀 Start Tutorial",
    guide_btn_skip_tutorial: "Skip tutorial",

    guide_scoring_title: "📊 Scoring System (RP)",
    guide_scoring_p1: "Each game awards base points (RP) upon completion. Additionally, you can earn bonuses for speed and consistency.",
    guide_base_rp: "Base RP",
    guide_base_rp_desc: "6.0 points guaranteed for finishing.",
    guide_speed: "Speed",
    guide_speed_desc: "You have a bonus of up to 10 Points that decays during the first 60 minutes. Be fast!",
    guide_penalty: "Penalty",
    guide_penalty_desc: "In Peaks and Valleys, -0.5 RP for each error. Accuracy is key.",
    guide_streak: "Daily Streak",
    guide_streak_desc: "Play every day to demonstrate your consistency.",
    guide_absence: "Absence",
    guide_absence_desc: "-10.0 RP for each day without playing.",
    guide_ranks_title: "🏆 Ranks System",
    guide_ranks_p1: "Accumulate RP to level up and unlock new ranks. Each rank represents your mastery in Jigsudo.",

    // UI Labels (English)
    label_level_prefix: "Level",
    label_peaks_remaining: "Remaining",
    label_peaks_errors: "Errors",
    label_peak: "Peak",
    label_valley: "Valley",
    btn_next_tip: "Next",
    btn_prev_tip: "Previous",

    // Authentication
    login_title: "Jigsudo Account",
    btn_login: "Log In",
    btn_login_menu: "Log In",
    btn_logout: "Log Out",
    btn_change_password: "Change Password",
    btn_change_username: "Change Username",
    btn_delete_account: "Delete Account",
    btn_register: "Create Account",
    link_register: "Sign Up",
    link_login: "Log In",
    btn_google_login: "Continue with Google",
    auth_or: "or",
    auth_success: "Welcome!",
    auth_logout: "Logged out",
    guest: "Anonymous",
    guest_profile_desc:
      "Sign in to save your progress and appear in the ranking.",
    user_default: "User",
    aria_show_password: "Show password",
    auth_email_placeholder: "Email",
    auth_password_placeholder: "Password",
    auth_no_account: "Don't have an account?",
    auth_have_account: "Already have an account?",
    auth_username_placeholder: "Username",
    auth_password_hint_placeholder: "Password (min 6 chars)",
    auth_repeat_password_placeholder: "Repeat Password",
    auth_confirm_pwd_title: "Confirm Password",
    auth_confirm_pwd_desc: "To proceed, please enter your current password.",
    auth_new_value_placeholder: "New value",
    auth_reset_pw_title: "Reset Password",
    auth_reset_pw_desc: "Enter your email to receive a reset link.",
    auth_forgot_password: "Forgot your password?",

    // Profile
    profile_title_page: "My Profile",
    btn_view_profile: "View Profile",

    // ... existing ...
    stat_days: "Jigsudos Completed",
    stat_streak: "Current Streak",
    stat_streak_short: "Streak",
    stat_daily: "Today",
    stat_max_streak: "Max Streak",
    stat_max_score: "Max Score",
    stat_best_time: "Best Time",
    stat_avg_time: "Avg Time",
    stat_avg_time: "Avg Time",
    stat_points: "Points",
    stats_details_title: "Average Times per Level",
    daily_avg_title: "Daily Average",
    stats_title: "Statistics",
    sc_invite_msg: "Challenge your mind with the daily puzzle!",
    no_data: "Not Enough Data",

    // Victory Summary
    victory_title: "Game Complete!",
    victory_desc: "Here is a summary of your session today.",
    victory_stat_time: "Total Time",
    victory_stat_streak: "Current Streak",
    victory_stat_errors: "Errors",
    victory_stat_score: "Score",
    victory_times_breakdown: "Times per Level",
    btn_back_home: "Back Home",
    btn_view_results: "View Results",
    btn_share_result: "Share Result",
    victory_share_title: "CHALLENGE COMPLETED",
    btn_close: "Close",

    ranking_you: "(You)",
    ranking_col_user: "User",
    ranking_col_points: "Points",

    stage_names: {
      memory: "Memory",
      jigsaw: "Jigsaw",
      sudoku: "Sudoku",
      peaks: "Peaks",
      search: "Search",
      code: "Code",
    },

    // Ranks
    rank_0: "Novice",
    rank_1: "Beginner",
    rank_2: "Amateur",
    rank_3: "Student",
    rank_4: "Analyst",
    rank_5: "Logician",
    rank_6: "Strategist",
    rank_7: "Veteran",
    rank_8: "Expert",
    rank_9: "Master",
    rank_10: "Sage",
    rank_11: "Scholar",
    rank_12: "Visionary",
    rank_13: "Enlightened",
    rank_14: "Oracle",
    rank_15: "Eternal",
    rank_level_prefix: "Lvl.",

    // Minigame Names for Profile
    p_game_memory: "Memory",
    p_game_jigsaw: "Jigsaw",
    p_game_sudoku: "Sudoku",
    p_game_peaks: "Peaks & Valleys",
    p_game_search: "Number Search",
    p_game_code: "The Code",

    // Auth Modals & Toasts
    modal_change_name_title: "Change Username",
    modal_change_name_desc: "Enter your new username.",
    modal_new_name_placeholder: "New username",
    modal_change_pw_title: "Change Password",
    modal_change_pw_desc: "Enter your current and new password.",
    modal_delete_account_title: "Delete Account",
    modal_delete_account_desc:
      "⚠️ This action is IRREVERSIBLE. Enter your password to confirm.",
    modal_delete_account_google_desc:
      "⚠️ This action is IRREVERSIBLE. Click Confirm to re-authenticate with Google.",

    modal_logout_title: "Log Out",
    modal_logout_desc: "Are you sure you want to log out?",

    modal_delete_confirm_title: "⚠️ Final Warning",
    modal_delete_confirm_desc:
      "This will delete <b>all your progress, stats, and ranking</b> forever. This action cannot be undone.",

    btn_confirm: "Confirm",
    btn_saving: "Saving...",
    btn_processing: "Processing...",
    btn_deleting: "Deleting...",
    btn_delete_all: "Delete Everything",
    btn_exiting: "Exiting...",
    err_auth_email_in_use: "Email already in use.",
    err_auth_invalid_email: "Invalid email.",
    err_auth_weak_password: "Password is too weak (min 6 characters).",
    err_auth_user_not_found: "User not found.",
    err_auth_wrong_password: "Incorrect password.",
    err_auth_too_many_requests: "Too many requests. Try again later.",
    err_auth_unauthorized_domain: "Unauthorized domain for Google Login.",
    err_auth_popup_closed:
      "The login window was closed before completing the process.",
    err_auth_cancelled_popup:
      "A login request is already in progress. Please wait.",
    err_auth_popup_blocked:
      "The browser blocked the login window. Please allow popups for this site.",
    err_auth_general: "Authentication error: ",
    err_user_exists: "Username is already taken.",

    sidebar_history: "History",
    history_title: "Puzzle History",
    history_select_date: "Select a date to play",

    toast_email_invalid: "The email is invalid.",
    toast_name_empty: "Username cannot be empty.",

    error_missing_puzzle: "There is no puzzle available for this day.",

    toast_name_success: "Username updated successfully.",
    toast_pw_empty: "Please fill in all fields.",
    toast_pw_mismatch: "New passwords do not match.",
    toast_pw_short: "New password must be at least 6 characters.",
    toast_pw_success: "Password updated successfully.",
    toast_pw_enter: "Please enter your password.",
    toast_delete_success: "Account deleted successfully.",
    toast_reset_sent: "Reset email sent. Please check your inbox.",
    toast_verification_sent: "Verification email sent.",
    toast_verification_too_many:
      "An email was already sent recently. Please wait a minute before requesting another.",
    btn_verify_now: "Verify now",
    modal_reg_success_title: "Registration Successful! 🥳",
    modal_reg_success_body:
      "We've sent you a verification email. Please check your inbox (and spam folder) to activate all features.",
    modal_reg_benefits_title: "Benefits of verification:",
    benefit_ranking: "Appear on the Global Leaderboard",
    benefit_cloud: "Automatic Cloud Saving",
    btn_go_to_email: "Go to %%provider%%",
    btn_go_to_generic_email: "Open my Email",
    btn_change_email: "Change Email",
    toast_email_change_sent:
      "A confirmation link has been sent to your new email. The change will be complete once you click it.",
    toast_logout_success: "Logged out successfully.",
    toast_logout_error: "Error logging out: ",
    error_missing_puzzle: "There is no puzzle available for this day.",
    error_missing_puzzle_day: "There is no puzzle available for day {day}.",

    // Placeholders
    placeholder_current_pw: "Current password",
    placeholder_new_email: "New email address",
    placeholder_new_pw: "New password (min 6 chars)",
    placeholder_verify_pw: "Repeat new password",

    // Support & Share
    share_text:
      "Challenge your mind with Jigsudo! 🧩✨ Can you solve the puzzle of the day?",
    toast_share_success: "Link copied to clipboard! 📋✨",

    // Stats Sharing
    btn_share_stats: "Share Stats",
    share_stats_msg: "Check out my progress in Jigsudo! 🧩✨",

    // SEO/Home Info (English)
    seo_title: "The Jigsudo Challenge: Train your mind every day",
    seo_summary: "What is Jigsudo?",
    seo_summary_text:
      "Jigsudo is a daily mental challenge that merges mechanics from Sudoku, Memory, Jigsaw, and other mini-games into a single smart board. Every day at 06:00 UTC, the board changes for a new challenge. From finding pairs in the Memory Game to cracking The Code, the game guides you through six interconnected stages that will test your reasoning.",
    seo_benefits: "Why solve logic puzzles?",
    seo_benefits_text:
      "Solving riddles and logic puzzles is a fantastic way to exercise your mind while having fun. Jigsudo offers you a space to test your patience and personal reasoning in an immersive way. Some of the reasons to take on the challenge are:",
    seo_benefit_1:
      "Purposeful entertainment: Each stage is a unique new mental challenge.",
    seo_benefit_2:
      "Focus and patience: The logic of all mini-games requires concentration and calm.",
    seo_benefit_3:
      "Stress relief: Immersing yourself in the game acts as an 'active meditation' for your day.",
    seo_ranking: "Climb the Global Leaderboard",
    seo_ranking_text:
      "By creating an account, you can measure your skill against players from all over the world. Jigsudo features a rank point system (RP) that penalizes inactivity while rewarding speed and precision. Don't miss your daily appointment and reach the Galactic rank!",
  },
};
