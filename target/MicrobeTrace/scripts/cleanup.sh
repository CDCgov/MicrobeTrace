#!/bin/sh

echo 'Removing Compressed Files...'

rm components/*.br components/*.gz
rm data/*.br data/*.gz
rm dist/*.br dist/*.gz
rm vendor/*.br vendor/*.gz
rm workers/*.br workers/*.gz
