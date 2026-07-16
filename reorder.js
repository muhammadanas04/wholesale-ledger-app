const fs = require('fs');
const content = fs.readFileSync('src/pages/OtherExpenses.jsx', 'utf8');

const partAStart = content.indexOf('          <form onSubmit={handleSubmit}');
const partAEnd = content.indexOf('          </form>') + '          </form>'.length;
const partA = content.slice(partAStart, partAEnd);

const partBStart = content.indexOf('          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">');
const partBEnd = content.indexOf('          </div>\n        </div>\n\n        {/* Categories Sidebar */}');
const partB = content.slice(partBStart, partBEnd + '          </div>'.length);

const partCStart = content.indexOf('        {/* Categories Sidebar */}');
const partCEnd = content.indexOf('        </div>\n      </div>\n\n      <ConfirmDialog');
const partC = content.slice(partCStart, partCEnd + '        </div>'.length);

const newContent = content.slice(0, partAStart) + partA + '\n        </div>\n\n' + partC + '\n      </div>\n\n' + '      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">\n' + partB.slice(partB.indexOf('          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">') + '          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">'.length).trimStart() + '\n\n' + content.slice(partCEnd + '        </div>\n      </div>\n\n'.length);

// Wait, the indentation for partB needs to be adjusted.
// Let's just adjust it by replacing 10 spaces with 6 spaces if we want, or leave it as is.
// Let's just use string replacement on the file.

let updated = content.replace(
  partA + '\n\n' + partB + '\n        </div>\n\n' + partC + '\n      </div>',
  partA + '\n        </div>\n\n' + partC + '\n      </div>\n\n      ' + partB.split('\n').map(line => line.replace(/^    /, '')).join('\n')
);

fs.writeFileSync('src/pages/OtherExpenses.jsx', updated);
console.log("Success");
