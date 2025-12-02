<?php
error_reporting(E_ALL);
ini_set("display_errors", 1);

require 'vendor/autoload.php';
use PhpOffice\PhpSpreadsheet\IOFactory;

if (!isset($_FILES['archivo'])) {
    echo json_encode(["error" => "No se recibió archivo"]);
    exit;
}

$tmp = $_FILES['archivo']['tmp_name'];

try {

    $spread = IOFactory::load($tmp);
    $hoja = $spread->getSheet(0);

    $filas = $hoja->toArray(null, true, true, true);

    if (!$filas) {
        echo json_encode(["error" => "El archivo está vacío o no tiene datos"]);
        exit;
    }

    $programacion = [];

    foreach ($filas as $i => $fila) {
        if ($i === 1) continue;

        if (empty($fila['A'])) continue; // evita filas vacías

        $programacion[] = [
            "id"     => trim($fila['A']),
            "nombre" => trim($fila['B']),
            "cliente"=> trim($fila['C']),
            "ciudad" => trim($fila['D']),
            "inicio" => trim($fila['E']),
            "fin"    => trim($fila['F']),
            "ruta"   => trim($fila['G']),
            "obs"    => trim($fila['H'])
        ];
    }

    echo json_encode($programacion);

} catch (Exception $e) {
    echo json_encode(["error" => $e->getMessage()]);
}
