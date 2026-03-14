try {
    require('./agent-content-assembler.js');
} catch (err) {
    console.error('WRAPPER ERROR:', err);
    process.exit(1);
}
