// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const prisma = new PrismaClient();

async function main() {
    const file = process.argv[2] || './data/products.xlsx';
    const workbook = XLSX.readFile(file);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    for (const r of rows) {
        const tipoPrenda = r['TIPO_PRENDA'] || '';
        const talla = r['TALLA'] || '';
        const color = r['COLOR'] || '';
        const name = `${tipoPrenda} ${color} ${talla}`.trim();

        const stock = parseInt(r['CANTIDAD_DISPONIBLE'] ?? 0);
        const price50 = parseFloat(r['PRECIO_50_U'] ?? 0);
        const price100 = parseFloat(r['PRECIO_100_U'] ?? 0);
        const price200 = parseFloat(r['PRECIO_200_U'] ?? 0);

        const description = r['DESCRIPCIÓN'] || '';
        const category = r['CATEGORÍA'] || '';
        const available = String(r['DISPONIBLE'] || '').toLowerCase().includes('si');

        await prisma.product.create({
            data: {
                name,
                description,
                category,
                size: talla,
                color,
                stock: isNaN(stock) ? 0 : stock,
                price: isNaN(price50) ? 0 : price50, // tomamos precio base el de 50 unidades
                price50: isNaN(price50) ? null : price50,
                price100: isNaN(price100) ? null : price100,
                price200: isNaN(price200) ? null : price200,
                available
            }
        });
    }
    console.log('✅ Seed completado con productos del Excel');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
