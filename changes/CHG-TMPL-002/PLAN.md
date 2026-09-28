# CHG-TMPL-002 — 따라하며 테스트하는 튜토리얼

## State

- Status: APPROVED
- Plan base: b62bc0516e72f972d3c42490933ff426e8c1b146

## Goal

독자가 직접 타이핑하며 한 사이클(서비스 등록 → Change → 계약 → 병렬 구현 → candidate 검증)을
완주할 수 있는 실습 문서를 추가한다. 의도된 실패 3번으로 도구가 무엇을 막는지 체험하게 한다.

## Non-goals

- GitHub 계정·네트워크 의존 (로컬 bare 레포로 완결)
- 새 런타임 의존성 (Node 내장 test runner만 사용)
- examples/todo 대체 — 완성된 사례는 읽기용으로 유지

## Acceptance criteria

- 문서의 명령을 위에서 아래로 그대로 실행해 완주할 수 있다.
- 의도된 실패 3건이 실제로 exit 1이며, 문서에 인용한 에러 문구와 일치한다.
- 문서가 언급한 모든 npm 명령이 실제로 존재한다.
- 기존 프레임워크·예제 스위트가 그대로 통과한다.

## Risks

- SHA는 실행마다 달라 기대 출력과 값이 다르다 → 문서 앞부분에 명시함.

## Stop conditions

- 문서의 명령이 실제로 동작하지 않는 경우.
