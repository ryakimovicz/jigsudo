import os

def clean_translations(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Target strings to clean
    target = '<a href="https://github.com/ryakimovicz/jigsudo" target="_blank">'
    content = content.replace(target, '')
    content = content.replace('</a>', '')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    clean_translations('f:/Proyectos/Web/jigsudo/js/translations.js')
