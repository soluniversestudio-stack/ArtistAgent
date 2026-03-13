const fs = require("fs");
const path = require("path");
const logPath = path.resolve(__dirname, "test_output.txt");
try {
    fs.writeFileSync(logPath, "Write test successful at " + new Date().toISOString());
    console.log("SUCCESS: Wrote to " + logPath);
} catch (err) {
    console.error("FAILURE: " + err.message);
}
