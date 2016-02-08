#! /bin/bash
# create a new post in posts/, properly named

DEFAULTOUTDIR=posts
DEFAULTAUTHOR=Jan
DEFAULTEXT=.markdown

usage ()
{
    echo "Usage: $(basename $0) [-d DATE] TITLE"
    echo "  -d DATE     optional date (default: today)"
    echo "  -t TAGS     tags, comma separated"
    echo "  -a AUTHOR   the name of the author, (default: $DEFAULTAUTHOR)"
    echo "  -e EXT      extension (default: $DEFAULTEXT)"
    echo "  -o OUTDIR   defaults to ${DEFAULTOUTDIR}"
    echo "  TITLE       are space-separted words"
    echo
}

while getopts d:t:a:e:o:v opt
do
    case "$opt" in
        d)  DATE="$OPTARG";;
        t)  TAGS="$OPTARG";;
        a)  AUTHOR="$OPTARG";;
        e)  EXT="$OPTARG";;
        v)  VERBOSE=1;;
        \?)  usage; exit 1;;
    esac
done
shift $(expr $OPTIND - 1)

[ $# -lt 1 ] && { usage; exit 1; }

OUTDIR=${OUTDIR:-$DEFAULTOUTDIR}
AUTHOR=${AUTHOR:-$DEFAULTAUTHOR}
EXT=${EXT:-$DEFAULTEXT}
TAGS=${TAGS:-blog}
[ -z "$DATE" ] && DATE=`date +"%F"`
TITLE=`echo $@ | tr ' ' '-'`
OUT=$OUTDIR/${DATE}-${TITLE}${EXT}


echo $OUT


cat > $OUT << EOF
---
title: $@
author: $AUTHOR
tags: $TAGS
---

Teaser text.

<div></div><!--more-->

More text.

EOF

exit 0

