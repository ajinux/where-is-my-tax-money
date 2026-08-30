from wimtm_data.issues import DataIssue, DataValidationError, format_issue


def test_format_issue_with_scope_and_no_detail() -> None:
    issue = DataIssue(
        code="sum-mismatch",
        section="union-expenditure",
        period="2024-25",
        factId="demand-1",
        message="does not sum",
    )
    assert format_issue(issue) == (
        "  [sum-mismatch] union-expenditure / 2024-25 / demand-1: does not sum"
    )


def test_format_issue_with_expected_and_observed() -> None:
    issue = DataIssue(
        code="sum-mismatch",
        message="does not sum",
        expected="10 rupees",
        observed="9 rupees",
    )
    assert format_issue(issue) == (
        "  [sum-mismatch] does not sum (expected 10 rupees, got 9 rupees)"
    )


def test_format_issue_with_no_scope() -> None:
    issue = DataIssue(code="schema-invalid", message="could not read x.json")
    assert format_issue(issue) == "  [schema-invalid] could not read x.json"


def test_data_validation_error_message_lists_every_issue() -> None:
    issues = [
        DataIssue(code="schema-invalid", message="a"),
        DataIssue(code="sum-mismatch", message="b"),
    ]
    error = DataValidationError(issues)
    assert error.issues == issues
    assert "2 issue(s)" in str(error)
    assert "[schema-invalid] a" in str(error)
    assert "[sum-mismatch] b" in str(error)
