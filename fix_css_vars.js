const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'frontend/src/components/ui');

function processDir(dirPath) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Replace var(--a/b/c) with var(--a-b-c)
      let modified = content.replace(/var\(--([^)]+)\)/g, (match, p1) => {
        return `var(--${p1.replace(/\//g, '-')})`;
      });
      
      if (modified !== content) {
        fs.writeFileSync(fullPath, modified);
        console.log(`Updated ${file}`);
      }
    }
  }
}

processDir(dir);
