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

    // Re-render structure only when route changes (to ensure it's there), 
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

    // Data structure for the changelog (Ordered newest first)
    const versions = [
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
