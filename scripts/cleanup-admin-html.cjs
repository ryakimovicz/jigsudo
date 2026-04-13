const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const marker = '<!-- Detail View: User Management (v1.6.0) -->';
const firstIndex = content.indexOf(marker);

if (firstIndex !== -1) {
    const secondIndex = content.indexOf(marker, firstIndex + marker.length);
    if (secondIndex !== -1) {
        console.log('Found two injections. Removing the first one at index', firstIndex);
        
        // Find the END of the first injection. 
        // It ends at a </section> tag.
        const endTag = '</section>';
        const endIndex = content.indexOf(endTag, firstIndex);
        
        if (endIndex !== -1 && endIndex < secondIndex) {
            const before = content.substring(0, firstIndex);
            const after = content.substring(endIndex + endTag.length);
            
            // We need to restore the </div> and </section> that we accidentally replaced
            const restored = '\n            </div>\n          </div>\n        </section>';
            
            content = before + restored + after;
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Successfully removed the first duplicate injection.');
        } else {
            console.log('Could not find a valid end tag for the first injection before the second one.');
        }
    } else {
        console.log('Only one injection found. No cleanup needed.');
    }
} else {
    console.log('Marker not found.');
}
