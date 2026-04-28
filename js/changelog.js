/**
 * Changelog subpage logic
 * Fetches translations and renders the version list.
 */
import { updateTexts } from "./i18n.js";

export function initChangelog() {
    const navChangelog = document.getElementById("nav-changelog");
    if (navChangelog) {
        navChangelog.addEventListener("click", () => {
            window.location.hash = "#changelog";
        });
    }

    renderChangelog();

    // Re-render structure only when route changed (to ensure it's there), 
    // but translations are handled globally via data-i18n
    window.addEventListener("routeChanged", (e) => {
        if (e.detail.route === "changelog-section") {
            renderChangelog();
        }
    });
}

function renderChangelog() {
    const container = document.getElementById("changelog-container");
    if (!container) return;

    // If structure already exists, don't re-render (seamless translation handles the rest)
    if (container.children.length > 0) return;

    const versions = [
        {
            tag: "v1.4.10",
            titleKey: "changelog_v1410_title",
            dateKey: "changelog_v1410_date",
            itemKeys: [
                "changelog_v1410_item1",
                "changelog_v1410_item2",
                "changelog_v1410_item3"
            ]
        },
        {
            tag: "v1.4.9",
            titleKey: "changelog_v149_title",
            dateKey: "changelog_v149_date",
            itemKeys: [
                "changelog_v149_item1",
                "changelog_v149_item2",
                "changelog_v149_item3"
            ]
        },
        {
            tag: "v1.4.8",
            titleKey: "changelog_v148_title",
            dateKey: "changelog_v148_date",
            itemKeys: [
                "changelog_v148_item1",
                "changelog_v148_item2"
            ]
        },
        {
            tag: "v1.4.7",
            titleKey: "changelog_v147_title",
            dateKey: "changelog_v147_date",
            itemKeys: [
                "changelog_v147_item1",
                "changelog_v147_item2",
                "changelog_v147_item3"
            ]
        },
        {
            tag: "v1.4.6",
            titleKey: "changelog_v146_title",
            dateKey: "changelog_v146_date",
            itemKeys: [
                "changelog_v146_item1",
                "changelog_v146_item2",
                "changelog_v146_item3",
                "changelog_v146_item4",
                "changelog_v146_item5",
                "changelog_v146_item6",
                "changelog_v146_item7"
            ]
        },
        {
            tag: "v1.4.5",
            titleKey: "changelog_v145_title",
            dateKey: "changelog_v145_date",
            itemKeys: [
                "changelog_v145_item1",
                "changelog_v145_item2",
                "changelog_v145_item3"
            ]
        },
        {
            tag: "v1.4.4",
            titleKey: "changelog_v144_title",
            dateKey: "changelog_v144_date",
            itemKeys: [
                "changelog_v144_item1",
                "changelog_v144_item2",
                "changelog_v144_item3"
            ]
        },
        {
            tag: "v1.4.3",
            titleKey: "changelog_v143_title",
            dateKey: "changelog_v143_date",
            itemKeys: [
                "changelog_v143_item1",
                "changelog_v143_item2"
            ]
        },
        {
            tag: "v1.4.2",
            titleKey: "changelog_v142_title",
            dateKey: "changelog_v142_date",
            itemKeys: [
                "changelog_v142_item1",
                "changelog_v142_item2",
                "changelog_v142_item3"
            ]
        },
        {
            tag: "v1.4.1",
            titleKey: "changelog_v141_title",
            dateKey: "changelog_v141_date",
            itemKeys: [
                "changelog_v141_item1",
                "changelog_v141_item2",
                "changelog_v141_item3",
                "changelog_v141_item4",
                "changelog_v141_item5",
                "changelog_v141_item6"
            ]
        },
        {
            tag: "v1.4.0",
            titleKey: "changelog_v140_title",
            dateKey: "changelog_v140_date",
            itemKeys: [
                "changelog_v140_item1",
                "changelog_v140_item2",
                "changelog_v140_item3",
                "changelog_v140_item4",
                "changelog_v140_item5"
            ]
        },
        {
            tag: "v1.3.10",
            titleKey: "changelog_v1310_title",
            dateKey: "changelog_v1310_date",
            itemKeys: [
                "changelog_v1310_item1",
                "changelog_v1310_item2",
                "changelog_v1310_item3",
                "changelog_v1310_item4",
                "changelog_v1310_item5",
                "changelog_v1310_item6"
            ]
        },
        {
            tag: "v1.3.9",
            titleKey: "changelog_v139_title",
            dateKey: "changelog_v139_date",
            itemKeys: [
                "changelog_v139_item1",
                "changelog_v139_item2"
            ]
        },
        {
            tag: "v1.3.8",
            titleKey: "changelog_v138_title",
            dateKey: "changelog_v138_date",
            itemKeys: [
                "changelog_v138_item1",
                "changelog_v138_item2",
                "changelog_v138_item3",
                "changelog_v138_item4",
                "changelog_v138_item5"
            ]
        },
        {
            tag: "v1.3.7",
            titleKey: "changelog_v137_title",
            dateKey: "changelog_v137_date",
            itemKeys: [
                "changelog_v137_item1"
            ]
        },
        {
            tag: "v1.3.6",
            titleKey: "changelog_v136_title",
            dateKey: "changelog_v136_date",
            itemKeys: [
                "changelog_v136_item1",
                "changelog_v136_item2",
                "changelog_v136_item3",
                "changelog_v136_item4",
                "changelog_v136_item5"
            ]
        },
        {
            tag: "v1.3.5",
            titleKey: "changelog_v135_title",
            dateKey: "changelog_v135_date",
            itemKeys: [
                "changelog_v135_item1",
                "changelog_v135_item2",
                "changelog_v135_item3",
                "changelog_v135_item4",
                "changelog_v135_item5"
            ]
        },
        {
            tag: "v1.3.4",
            titleKey: "changelog_v134_title",
            dateKey: "changelog_v134_date",
            itemKeys: [
                "changelog_v134_item1",
                "changelog_v134_item2",
                "changelog_v134_item3",
                "changelog_v134_item4",
                "changelog_v134_item5"
            ]
        },
        {
            tag: "v1.3.3",
            titleKey: "changelog_v133_title",
            dateKey: "changelog_v133_date",
            itemKeys: [
                "changelog_v133_item1",
                "changelog_v133_item2",
                "changelog_v133_item3",
                "changelog_v133_item4",
                "changelog_v133_item5",
                "changelog_v133_item6"
            ]
        },
        {
            tag: "v1.3.2",
            titleKey: "changelog_v132_title",
            dateKey: "changelog_v132_date",
            itemKeys: [
                "changelog_v132_item1",
                "changelog_v132_item2",
                "changelog_v132_item3",
                "changelog_v132_item4"
            ]
        },
        {
            tag: "v1.3.1",
            titleKey: "changelog_v131_title",
            dateKey: "changelog_v131_date",
            itemKeys: [
                "changelog_v131_item1",
                "changelog_v131_item2",
                "changelog_v131_item3"
            ]
        },
        {
            tag: "v1.3.0",
            titleKey: "changelog_v130_title",
            dateKey: "changelog_v130_date",
            itemKeys: [
                "changelog_v130_item1",
                "changelog_v130_item2",
                "changelog_v130_item3",
                "changelog_v130_item4",
                "changelog_v130_item5"
            ]
        },
        {
            tag: "v1.2.2",
            titleKey: "changelog_v122_title",
            dateKey: "changelog_v122_date",
            itemKeys: [
                "changelog_v122_item1",
                "changelog_v122_item2",
                "changelog_v122_item3",
                "changelog_v122_item4",
                "changelog_v122_item5",
                "changelog_v122_item6",
                "changelog_v122_item7",
                "changelog_v122_item8",
                "changelog_v122_item9"
            ]
        },
        {
            tag: "v1.2.1",
            titleKey: "changelog_v121_title",
            dateKey: "changelog_v121_date",
            itemKeys: [
                "changelog_v121_item1",
                "changelog_v121_item2",
                "changelog_v121_item3",
                "changelog_v121_item4",
                "changelog_v121_item5"
            ]
        },
        {
            tag: "v1.2.0",
            titleKey: "changelog_v120_title",
            dateKey: "changelog_v120_date",
            itemKeys: [
                "changelog_v120_item1",
                "changelog_v120_item2",
                "changelog_v120_item3",
                "changelog_v120_item4",
                "changelog_v120_item5",
                "changelog_v120_item6",
                "changelog_v120_item7",
                "changelog_v120_item8"
            ]
        },
        {
            tag: "v1.1.19",
            titleKey: "changelog_v1119_title",
            dateKey: "changelog_v1119_date",
            itemKeys: [
                "changelog_v1119_item1",
                "changelog_v1119_item2"
            ]
        },
        {
            tag: "v1.1.18",
            titleKey: "changelog_v1118_title",
            dateKey: "changelog_v1118_date",
            itemKeys: [
                "changelog_v1118_item1",
                "changelog_v1118_item2",
                "changelog_v1118_item3",
                "changelog_v1118_item4",
                "changelog_v1118_item5",
                "changelog_v1118_item6",
                "changelog_v1118_item7"
            ]
        },
        {
            tag: "v1.1.17",
            titleKey: "changelog_v1117_title",
            dateKey: "changelog_v1117_date",
            itemKeys: [
                "changelog_v1117_item1",
                "changelog_v1117_item2",
                "changelog_v1117_item3"
            ]
        },
        {
            tag: "v1.1.16",
            titleKey: "changelog_v1116_title",
            dateKey: "changelog_v1116_date",
            itemKeys: [
                "changelog_v1116_item1",
            ]
        },
        {
            tag: "v1.1.15",
            titleKey: "changelog_v1115_title",
            dateKey: "changelog_v1115_date",
            itemKeys: [
                "changelog_v1115_item1",
                "changelog_v1115_item2",
            ]
        },
        {
            tag: "v1.1.14",
            titleKey: "changelog_v1114_title",
            dateKey: "changelog_v1114_date",
            itemKeys: [
                "changelog_v1114_item1",
                "changelog_v1114_item2",
            ]
        },
        {
            tag: "v1.1.13",
            titleKey: "changelog_v1113_title",
            dateKey: "changelog_v1113_date",
            itemKeys: [
                "changelog_v1113_item1",
            ]
        },
        {
            tag: "v1.1.12",
            titleKey: "changelog_v1112_title",
            dateKey: "changelog_v1112_date",
            itemKeys: [
                "changelog_v1112_item1",
                "changelog_v1112_item2",
                "changelog_v1112_item3",
                "changelog_v1112_item4",
                "changelog_v1112_item5",
                "changelog_v1112_item6",
                "changelog_v1112_item7",
            ]
        },
        {
            tag: "v1.1.11",
            titleKey: "changelog_v1111_title",
            dateKey: "changelog_v1111_date",
            itemKeys: [
                "changelog_v1111_item1",
                "changelog_v1111_item2",
                "changelog_v1111_item3",
                "changelog_v1111_item4",
                "changelog_v1111_item5",
            ]
        },
        {
            tag: "v1.1.10",
            titleKey: "changelog_v1110_title",
            dateKey: "changelog_v1110_date",
            itemKeys: [
                "changelog_v1110_item1",
            ]
        },
        {
            tag: "v1.1.9",
            titleKey: "changelog_v119_title",
            dateKey: "changelog_v119_date",
            itemKeys: [
                "changelog_v119_item1",
            ]
        },
        {
            tag: "v1.1.8",
            titleKey: "changelog_v118_title",
            dateKey: "changelog_v118_date",
            itemKeys: [
                "changelog_v118_item1",
            ]
        },
        {
            tag: "v1.1.7",
            titleKey: "changelog_v117_title",
            dateKey: "changelog_v117_date",
            itemKeys: [
                "changelog_v117_item1",
                "changelog_v117_item2",
                "changelog_v117_item3",
                "changelog_v117_item4",
            ]
        },
        {
            tag: "v1.1.6",
            titleKey: "changelog_v116_title",
            dateKey: "changelog_v116_date",
            itemKeys: [
                "changelog_v116_item1",
                "changelog_v116_item2",
                "changelog_v116_item3",
            ]
        },
        {
            tag: "v1.1.5",
            titleKey: "changelog_v115_title",
            dateKey: "changelog_v115_date",
            itemKeys: [
                "changelog_v115_item1",
            ]
        },
        {
            tag: "v1.1.4",
            titleKey: "changelog_v114_title",
            dateKey: "changelog_v114_date",
            itemKeys: [
                "changelog_v114_item1",
            ]
        },
        {
            tag: "v1.1.3",
            titleKey: "changelog_v113_title",
            dateKey: "changelog_v113_date",
            itemKeys: [
                "changelog_v113_item1",
                "changelog_v113_item2",
            ]
        },
        {
            tag: "v1.1.2",
            titleKey: "changelog_v112_title",
            dateKey: "changelog_v112_date",
            itemKeys: [
                "changelog_v112_item1",
                "changelog_v112_item2",
            ]
        },
        {
            tag: "v1.1.1",
            titleKey: "changelog_v111_title",
            dateKey: "changelog_v111_date",
            itemKeys: [
                "changelog_v111_item1",
            ]
        },
        {
            tag: "v1.1.0",
            titleKey: "changelog_v110_title",
            dateKey: "changelog_v110_date",
            itemKeys: [
                "changelog_v110_item1",
                "changelog_v110_item2",
                "changelog_v110_item3",
                "changelog_v110_item4",
                "changelog_v110_item5",
                "changelog_v110_item6",
            ]
        },
        {
            tag: "v1.0.1 - v1.0.14",
            titleKey: "changelog_v101_14_title",
            dateKey: "changelog_v101_14_date",
            itemKeys: [
                "changelog_v101_14_item1"
            ]
        },
        {
            tag: "v1.0.0",
            titleKey: "changelog_v100_title",
            dateKey: "changelog_v100_date",
            itemKeys: [
                "changelog_v100_item1"
            ]
        }
    ];

    // Build the UI structure with data-i18n attributes
    versions.forEach(v => {
        const card = document.createElement("div");
        card.className = "changelog-version-card glass-panel";

        const header = document.createElement("div");
        header.className = "changelog-header";
        
        const titleSpan = document.createElement("span");
        titleSpan.className = "changelog-version-title";
        titleSpan.setAttribute("data-i18n", v.titleKey);
        
        const dateSpan = document.createElement("span");
        dateSpan.className = "changelog-date";
        dateSpan.setAttribute("data-i18n", v.dateKey);

        header.appendChild(titleSpan);
        header.appendChild(dateSpan);

        const list = document.createElement("ul");
        list.className = "changelog-list";
        
        v.itemKeys.forEach(key => {
            const li = document.createElement("li");
            li.className = "changelog-item";
            li.setAttribute("data-i18n", key);
            list.appendChild(li);
        });

        card.appendChild(header);
        card.appendChild(list);
        container.appendChild(card);
    });

    // Populate the newly created elements with current language texts
    updateTexts();
}
