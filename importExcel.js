const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    // 1️⃣ Leer el archivo Excel
    const workbook = XLSX.readFile("./data/products.xlsx"); // tu archivo Excel
    const sheetName = workbook.SheetNames[0]; // primera hoja
    const worksheet = workbook.Sheets[sheetName];

    // 2️⃣ Convertir hoja a JSON
    const data = XLSX.utils.sheet_to_json(worksheet);

    // 3️⃣ Mapear columnas del Excel al modelo Prisma
    const mappedData = data.map((row) => ({
        tipoPrenda: row.TIPO_PRENDA || "otros",
        talla: row.TALLA || null,
        color: row.COLOR || null,
        stock: parseInt(row.CANTIDAD_DISPONIBLE) || 0,
        price50: row.PRECIO_50_U ? parseFloat(row.PRECIO_50_U) : null,
        price100: row.PRECIO_100_U ? parseFloat(row.PRECIO_100_U) : null,
        price200: row.PRECIO_200_U ? parseFloat(row.PRECIO_200_U) : null,
        disponible: row.DISPONIBLE || null,
        categoria: row["CATEGORÍA"] || null,
        descripcion: row["DESCRIPCIÓN"] || null,
    }));

    // 4️⃣ Insertar en la base de datos
    await prisma.product.createMany({
        data: mappedData,
        skipDuplicates: true, // opcional: ignora duplicados según ID
    });

    console.log("¡Productos importados correctamente!");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
