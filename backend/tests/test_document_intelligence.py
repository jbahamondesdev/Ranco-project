from app.pipeline.document_intelligence import clean_layout_text


def _paragraph(content: str, offset: int, role: str | None = None) -> dict:
    p = {"content": content, "spans": [{"offset": offset, "length": len(content)}]}
    if role:
        p["role"] = role
    return p


def test_clean_layout_text_joins_paragraphs_in_order():
    raw = {
        "content": "unused",
        "paragraphs": [
            _paragraph("FACTURA", 0),
            _paragraph("Cliente: Juan Perez", 8),
        ],
    }

    text = clean_layout_text(raw)

    assert text == "FACTURA\n\nCliente: Juan Perez"


def test_clean_layout_text_excludes_header_footer_and_footnote_roles():
    raw = {
        "content": "unused",
        "paragraphs": [
            _paragraph("Encabezado repetido", 0, role="pageHeader"),
            _paragraph("Cuerpo real del documento", 20, role=None),
            _paragraph("WWW.EJEMPLO.COM", 50, role="pageFooter"),
            _paragraph("nota al pie", 70, role="footnote"),
        ],
    }

    text = clean_layout_text(raw)

    assert text == "Cuerpo real del documento"


def test_clean_layout_text_falls_back_to_content_when_no_paragraphs():
    raw = {"content": "texto crudo sin paragraphs"}
    assert clean_layout_text(raw) == "texto crudo sin paragraphs"


def test_clean_layout_text_renders_table_as_markdown_once():
    # las celdas de la tabla tambien aparecen como parrafos individuales (asi viene de
    # verdad la respuesta de Azure DI) - deben saltarse y reemplazarse por una unica
    # tabla markdown en el lugar donde aparece, no quedar como texto suelto duplicado
    raw = {
        "content": "unused",
        "paragraphs": [
            _paragraph("Antes de la tabla", 0),
            _paragraph("Producto", 20),
            _paragraph("Cantidad", 30),
            _paragraph("Tornillo", 40),
            _paragraph("10", 50),
            _paragraph("Despues de la tabla", 60),
        ],
        "tables": [
            {
                "rowCount": 2,
                "columnCount": 2,
                "cells": [
                    {"rowIndex": 0, "columnIndex": 0, "content": "Producto", "spans": [{"offset": 20, "length": 8}]},
                    {"rowIndex": 0, "columnIndex": 1, "content": "Cantidad", "spans": [{"offset": 30, "length": 8}]},
                    {"rowIndex": 1, "columnIndex": 0, "content": "Tornillo", "spans": [{"offset": 40, "length": 8}]},
                    {"rowIndex": 1, "columnIndex": 1, "content": "10", "spans": [{"offset": 50, "length": 2}]},
                ],
            }
        ],
    }

    text = clean_layout_text(raw)

    assert text == (
        "Antes de la tabla\n\n"
        "| Producto | Cantidad |\n"
        "| --- | --- |\n"
        "| Tornillo | 10 |\n\n"
        "Despues de la tabla"
    )


def test_clean_layout_text_escapes_pipe_and_newline_in_cell_content():
    raw = {
        "content": "unused",
        "paragraphs": [_paragraph("a|b\nc", 0)],
        "tables": [
            {
                "rowCount": 1,
                "columnCount": 1,
                "cells": [{"rowIndex": 0, "columnIndex": 0, "content": "a|b\nc", "spans": [{"offset": 0, "length": 5}]}],
            }
        ],
    }

    text = clean_layout_text(raw)

    assert "a\\|b c" in text


def test_clean_layout_text_includes_table_never_referenced_by_a_paragraph():
    raw = {
        "content": "unused",
        "paragraphs": [_paragraph("Solo texto", 0)],
        "tables": [
            {
                "rowCount": 1,
                "columnCount": 1,
                "cells": [{"rowIndex": 0, "columnIndex": 0, "content": "huerfana"}],
            }
        ],
    }

    text = clean_layout_text(raw)

    assert "Solo texto" in text
    assert "huerfana" in text
