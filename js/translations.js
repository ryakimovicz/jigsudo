export const translations = {
  es: {
    app_title: "JIGSUDO",
    header_stats_label: "Estadísticas",
    header_profile_label: "Perfil",

    // Header Info
    date_locale: "es-ES" /* For date formatting logic */,

    // Generic
    soon: "(Próximamente)",

    // Sidebar
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

    // Game Names
    game_memory: "Juego de Memoria",
    game_jigsaw: "Rompecabezas",
    game_sudoku: "Sudoku",
    game_peaks: "Picos y Valles",
    game_search: "Sopa de Números",

    // Menu Main Content
    menu_title: "Seis desafíos, un solo tablero",
    // innerHTML for description to preserve strong tags
    menu_description_html: `Todo empieza con el <strong>Juego de Memoria</strong>: encuentra los
            pares, consigue las piezas y arma el <strong>Rompecabezas</strong>.
            Solo así podrás enfrentar al <strong>Sudoku</strong>, superar los
            <strong>Picos y Valles</strong>, buscar en la <strong>Sopa de Números</strong> 
            y descifrar <strong>El Código</strong> final.`,
    menu_tagline: "Tu dosis diaria de números te está esperando",
    btn_start: "EMPEZAR",
    btn_start: "EMPEZAR",
    btn_coming_soon: "PRÓXIMAMENTE",
    btn_solve: "Resolver",

    // Profile Dropdown
    profile_header: "Mí perfil",
    profile_dark_mode: "Modo Oscuro",
    profile_auto: "Automático",
    profile_settings: "Ajustes",
    profile_quick_clear: "Borrado Rápido",
    profile_language: "Idioma",
    settings_account: "Cuenta",
    settings_title: "Configuración",
    settings_appearance: "Apariencia",
    settings_gameplay: "Jugabilidad",
    // New Keys
    theme_light: "Claro",
    theme_auto: "Auto",
    theme_dark: "Oscuro",
    setting_sound: "Sonido",
    setting_vibration: "Vibración",
    setting_confirm_clear: "Confirmar Borrado",
    greeting_prefix: "Hola,",

    // Footer
    footer_rights: "© 2026 Román Yakimovicz",

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
    alert_next_sudoku: "Siguiente juego: Sudoku\nPróximamente",
    alert_next_peaks: "Siguiente juego: Picos y Valles\nPróximamente",
    alert_next_search: "Siguiente juego: Sopa de Números\nPróximamente",

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
    auth_success: "¡Bienvenido!",
    auth_logout: "Sesión cerrada",

    // Auth Modals & Toasts
    modal_change_name_title: "Cambiar Nombre",
    modal_change_name_desc: "Ingresa tu nuevo nombre de usuario.",
    modal_new_name_placeholder: "Nuevo nombre",
    modal_change_pw_title: "Cambiar Contraseña",
    modal_change_pw_desc: "Ingresa tu contraseña actual y la nueva.",
    modal_delete_account_title: "Eliminar Cuenta",
    modal_delete_account_desc:
      "⚠️ Esta acción es IRREVERSIBLE. Ingresa tu contraseña para confirmar.",

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

    toast_name_empty: "El nombre no puede estar vacío.",
    toast_name_success: "Nombre actualizado exitosamente.",
    toast_pw_empty: "Completa todos los campos.",
    toast_pw_mismatch: "Las contraseñas nuevas no coinciden.",
    toast_pw_short: "La nueva contraseña debe tener al menos 6 caracteres.",
    toast_pw_success: "Contraseña actualizada correctamente.",
    toast_pw_enter: "Ingresa tu contraseña.",
    toast_delete_success: "Cuenta eliminada. Hasta luego.",
    toast_logout_success: "Sesión cerrada correctamente.",
    toast_logout_success: "Sesión cerrada correctamente.",
    toast_logout_error: "Error al cerrar sesión: ",

    // Placeholders
    placeholder_current_pw: "Contraseña actual",
    placeholder_new_pw: "Nueva contraseña (mín 6 caracteres)",
    placeholder_verify_pw: "Repetir nueva contraseña",

    // Profile Stats (Spanish)
    profile_title_page: "Mi Perfil",
    btn_view_profile: "Ver Perfil",
    stat_days: "Niveles Completados",
    stat_streak: "Racha Actual",
    stat_max_streak: "Racha Máx.",
    stat_max_score: "Puntaje Máx.",
    stat_best_time: "Tiempo Récord",
    stat_avg_time: "Tiempo Prom.",
    stats_details_title: "Tiempos por Juego (Promedio)",
    daily_avg_title: "Promedio Diario",
    stats_title: "Estadísticas",
    no_data: "Sin datos suficientes",

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
    p_game_memory: "Memoria",
    p_game_jigsaw: "Rompecabezas",
    p_game_sudoku: "Sudoku",
    p_game_peaks: "Picos y Valles",
    p_game_search: "Sopa Números",
    p_game_code: "El Código",
  },
  en: {
    app_title: "JIGSUDO",
    header_stats_label: "Statistics",
    header_profile_label: "Profile",

    // Header Info
    date_locale: "en-US",

    // Generic
    soon: "(Coming Soon)",

    // Sidebar
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

    // Game Names
    game_memory: "Memory Game",
    game_jigsaw: "Jigsaw Puzzle",
    game_sudoku: "Sudoku",
    game_peaks: "Peaks & Valleys",
    game_search: "Number Search",

    // Menu Main Content
    menu_title: "Six challenges, one single board",
    menu_description_html: `It all starts with the <strong>Memory Game</strong>: find the 
            pairs, get the pieces and solve the <strong>Jigsaw Puzzle</strong>.
            Only then can you face the <strong>Sudoku</strong>, overcome the 
            <strong>Peaks and Valleys</strong>, search in the <strong>Number Search</strong> 
            and crack <strong>The Code</strong> at the end.`,
    menu_tagline: "Your daily dose of numbers is waiting for you",
    btn_start: "START",
    btn_start: "START",
    btn_coming_soon: "COMING SOON",
    btn_solve: "Solve",

    // Profile Dropdown
    profile_header: "My Profile",
    profile_dark_mode: "Dark Mode",
    profile_auto: "Automatic",
    profile_settings: "Settings",
    profile_quick_clear: "Quick Clear",
    profile_language: "Language",

    // Footer
    footer_rights: "© 2026 Román Yakimovicz",

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
    settings_appearance: "Appearance",
    settings_gameplay: "Gameplay",
    // New Keys
    theme_light: "Light",
    theme_auto: "Auto",
    theme_dark: "Dark",
    setting_sound: "Sound",
    setting_vibration: "Vibration",
    setting_confirm_clear: "Confirm Clear",
    greeting_prefix: "Hi,",
    // New Keys
    theme_light: "Light",
    theme_auto: "Auto",
    theme_dark: "Dark",
    setting_sound: "Sound",
    setting_vibration: "Vibration",
    setting_confirm_clear: "Confirm Clear",
    greeting_prefix: "Hello,",
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
    auth_success: "Welcome!",
    auth_logout: "Logged out",

    // Profile
    profile_title_page: "My Profile",
    btn_view_profile: "View Profile",

    // ... existing ...
    stat_days: "Levels Completed",
    stat_streak: "Current Streak",
    stat_max_streak: "Max Streak",
    stat_max_score: "Max Score",
    stat_best_time: "Best Time",
    stat_avg_time: "Avg Time",
    stats_details_title: "Game Times (Average)",
    daily_avg_title: "Daily Average",
    stats_title: "Statistics",
    no_data: "Not Enough Data",

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

    modal_logout_title: "Log Out",
    modal_logout_desc: "Are you sure you want to log out?",

    modal_delete_confirm_title: "⚠️ Final Warning",
    modal_delete_confirm_desc:
      "This will delete <b>all your progress, stats, and ranking</b> forever. This action cannot be undone.",

    btn_confirm: "Confirm",
    btn_saving: "Saving...",
    btn_processing: "Processing...",
    btn_deleting: "Deleting...",
    btn_delete_all: "Delete All",
    btn_exiting: "Logging out...",

    toast_name_empty: "Username cannot be empty.",
    toast_name_success: "Username updated successfully.",
    toast_pw_empty: "Please fill in all fields.",
    toast_pw_mismatch: "New passwords do not match.",
    toast_pw_short: "New password must be at least 6 characters.",
    toast_pw_success: "Password updated successfully.",
    toast_pw_enter: "Please enter your password.",
    toast_delete_success: "Account deleted. Goodbye.",
    toast_logout_success: "Logged out successfully.",
    toast_logout_error: "Error logging out: ",

    // Placeholders
    placeholder_current_pw: "Current password",
    placeholder_new_pw: "New password (min 6 chars)",
    placeholder_verify_pw: "Repeat new password",
  },
};
