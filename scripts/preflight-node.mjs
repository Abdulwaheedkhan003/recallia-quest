const [maj, min] = process.versions.node.split('.').map(Number)
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`Recallia Quest needs Node.js 22.13 or newer (you have ${process.versions.node}). Install the LTS from https://nodejs.org`)
  process.exit(1)
}
