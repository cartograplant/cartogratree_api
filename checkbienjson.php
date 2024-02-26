<?php

$handle = fopen("bien.geojson.json-bak", "r");
$handlewrite = fopen("bien.geojson.json", "w");
$lc = 0;
if ($handle) {
    while (($line = fgets($handle)) !== false) {
	$lc++;
        // process the line read.
	if (substr($line,0,1) != ',' && $lc > 1 && $lc < 25261289) {
	   echo $lc . " - missing comma\n";
	   $line = ',' . $line;
	}
	fwrite($handlewrite, $line);
	// echo substr($line,0,1) . "\n";
    }
    fclose($handle);
    fclose($handlewrite);
}

?>
