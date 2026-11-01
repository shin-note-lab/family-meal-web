# システム構成と初期監査（2026-11-01 UTC）

## 確認した基準

GitHub `shin-note-lab/family-meal-web` はpublic、default branchはmain。開始SHA `1090c3cf97f4125ed8a3c8208c3a9cc2ba8010e5`（2026-10-31）。再帰ツリーはtruncated=false、13ファイル。ブランチ一覧はmainのみ・protected=false。履歴は64コミット（2026-10-26〜31）、直近は「Add files via upload」が続く。コードの正本はこのGitHubであり過去ZIPではない。

開始時の全ファイル： `apple-touch-icon.png`、`favicon-16x16.png`、`favicon-32x32.png`、`favicon-48x48.png`、`favicon.ico`、`icon-192.png`、`icon-512.png`、`icon-maskable-192.png`、`icon-maskable-512.png`、`icon-original.png`、`index.html`、`manifest.webmanifest`、`sw.js`。

既存管理文書、package定義、テスト、workflow、Edgeソースは存在しなかった。今回はAGENTS.md、docsの3文書、testsの1ファイル、primaryのソースのみ追加する。配信資産の編集・削除はしない。大規模なファイル分割は別課題とする。

## データと通信

Android/Windowsブラウザ → GitHub Pagesの単一HTML/CSS/JS。
ブラウザ → Supabase Auth（公開publishable key、セッション更新）→ primary Edge Function（Bearer token）→ Notion API。
EdgeはAuth `/auth/v1/user` でメール確認済みユーザーを確認し、family_membersのowner/member、family_app_scopeの家族一致を検査。service roleとNotionトークンはDeno.env参照。CORSは `https://shin-note-lab.github.io`。`verify_jwt=false` でも関数内認証を実施するため、設定値だけで認証なしとは判断しない。

primaryは **v27 ACTIVE**（報告のv26は現行ではない）。Notion API版2025-09-03。Gitへ取得したソースと本番バンドルの記録はOPERATIONS参照。他関数はfamily-meal-web v2、family-meal-sync v3、family-meal-notion-sync-v2 v2、family-meal-push v2（全ACTIVE）。後者の内容・利用状況は未監査。

Notionの料理・好みは料理マスタ、献立/実食は献立DB、日別給食は給食DB。現行primaryのDBマッピングは取得ソースに記載。好み履歴DBはNotionに存在するが、primaryの一般更新から履歴追記する処理は見当たらない。

Supabase publicには15テーブルが存在し全てRLS有効（一覧メタデータ確認）。旧foods/menus/school_mealsも残るが、現行フロントの主要データはNotion gateway経由。family_members/family_app_scopeで権限、meal_slot_leasesとRPCで献立枠の排他を行う。ポリシーとRPC実装の詳細監査は未実施。AuthのSite URL/redirect/sign-up設定は未取得。Security Advisorは漏洩パスワード保護無効WARN、6表にRLS有効・policyなしINFO。後者はサービス専用の可能性があり、安易に許可ポリシーを追加しない。

## API契約（取得ソース）

POST `/functions/v1/family-meal-notion-primary`、JSON、Authorization Bearer。OPTIONS対応。基本 `table` はfoods/menus/school_meals。`list` は `{rows}`、`create` はrow、`update/delete` はid（updateにrow）、保存結果は `{rows}`。idは対象Notion data sourceとの一致検査あり。一般更新に旧値/版による競合検査は見当たらない。

写真候補：`recipe_photo_preview_url`（foods、recipe_url、保存前）/ `recipe_photo_preview`（foods、id、保存済み）→ `{image_url,image_urls,recipe_url}`。候補は最大24、JSON-LD・meta・img等から抽出。
写真選択保存：`recipe_photo_external`（foods、id、image_url、replace）で参考URLを再取得し候補一致、HTTPS、MIME、サイズを検査→Notion file_upload→料理写真と写真出典→`{rows}`。`photo` はdata_url、`photo_external` は限定外部画像、`photo_delete` は写真削除。photo_urlはlistで再取得する（Notion署名URLは恒久保存しない）。

献立：`menu_upsert`（menus、row）で日付/食事枠/実食別にロック、既存最新ページを更新。料理メモ：recipe_notes_update/cooking_notes_update。レシピ内容取得：recipe_extract_preview。家族管理：family_members_list/family_inviteはowner限定。今回実APIでこれらを実行していない。詳細の許容入力/エラーは取得ソースを正とする。

## Driveと仕様資料

`schoolUploadOpen()` は固定フォルダ `https://drive.google.com/drive/folders/1dbVqUA7O8VodherGzwly6BRYRdls-4aJ` を開く。Driveメタデータでフォルダ名「給食表」を確認し、直下の原本画像1件と年別フォルダ1件を確認。原本内容・全階層・Androidでのアクセスは未検証。アプリからDrive APIへの自動アップロードではない。給食取り込みは端末内OCR/手修正→Notion保存。

参照したNotion：

- [家庭献立の運用ページ](https://app.notion.com/p/40096ff60eed8140927cf58765bec57b)（返却更新時点2026-10-28）。土日登園なし等を確認。
- [開発・運用ロードマップ](https://app.notion.com/p/40596ff60eed819bae52e1c6a3562e1e)。過去計画と履歴が混在し、現行の版と読み分けが必要。

最新の指定正本は、利用者指定の **献立プロジェクト統合運用仕様書v2.3（2026-10-31）**。名称・版・日付を登録した。ローカル資料とNotion/Drive検索では本文・参照URLを特定できず、本文の入手および管理文書との内容照合は入手待ち。上記Notionページをv2.3の代替としない。本文を推測しない。業務内容や家族の個人情報を公開Gitへ複製しない。

### 既存の未完了要件（今回の利用者指定）

- 保存前のレシピ写真候補選択：実装の存在は確認しているが、画面から選択→料理保存→Notion写真保存→再取得の受入確認は未完了。既存の未完了要件として追跡する。
- 土曜日の「保育所休み」表示：未完了。現行の「本人登園なし」や保存statusの表示と混同しない。

今回の調整は文書整備のみで、上記機能の修正・本番更新は行わない。

## 調査の限界と優先課題

| 優先 | 課題・証拠 | 次の確認 |
| --- | --- | --- |
| P1 | SSRF：publicHttpsはIP直書き等を拒否するがDNS解決先のprivate IPを検査しない。Range指定後に全bodyを読みサイズ判定 | DNS/再解決/リダイレクト/読み込み上限をモックで監査。悪用リクエストを本番へ送らない |
| P1 | 料理本体保存→写真保存は別処理。後段失敗時も本体は保存済みで再試行が重複名に阻まれうる | UIの部分保存・再試行・二重送信をモックE2Eで確認 |
| P1 | 一般料理更新の競合検査、好み履歴追記が見当たらない | 同時編集と履歴要件を最新版仕様と照合 |
| P1 | 土曜日「保育所休み」の文字列/変換が現行HTMLにない。取り込み時は「本人登園なし」、表示は保存status/menuを直接使用 | 土日・既存取り込み済みデータの表示をモックで再現し承認後に修正 |
| P1 | Pages配信ブランチ/パス・公開版とGit SHAの一致が未確認 | Pages設定と配信3資産を読取照合 |
| P2 | v26ではなくv27。候補選択APIは現行双方にあるがv26ソース未取得 | v27契約のモックは実施。本番の認証付き往復は未検証 |
| P2 | sw.jsは10/30の固定cache名、navigationはnetwork-firstだがoffline fallbackのHTMLは古いままになりうる。activateで同一originの他cacheも削除 | 更新前後/オンライン/オフライン/同一origin別アプリを隔離検証 |
| P2 | 大きな単一HTML（758252 bytes）、埋込画像、アップロード中心の履歴、main保護なし | 小さなPR運用。大規模分割/保護設定変更は別途検討 |
| P2 | Auth漏洩パスワード保護WARN、認証設定全体未確認 | 対応のプラン/費用と設定を読取確認し別途承認 |

通常Git cloneはproxy接続不能、公開URLはWeb取得ツールでアクセス不可。GitHub Pages設定/デプロイ/workflows一覧は接続ツールの許可対象外。したがって「公開とmainが一致」「画面動作済み」「保存済み」は未確認。Supabase changelog.mdも取得ツールのMIME制約で未読（今回は機能改修なし）。

既存Push関数・cron関連表は発見したが、稼働する定期ジョブの有無は未確認。既存運用を勝手に停止/変更せず、今回新たな監視・定期実行を設定していない。

## 最終調整時の再確認

2026-11-01、GitHub APIで最新mainコミットと再帰ツリーを再取得。SHAは引き続き `1090c3cf97f4125ed8a3c8208c3a9cc2ba8010e5`、13ファイル。既存配信テキスト3ファイルはGit blob SHAで一致を確認。画像10ファイルは未ダウンロードのため、ツリーメタデータを保持して追加6ファイルだけの適用案を作成する。通常cloneはproxy:8080接続不能、ブランチ作成APIも403のため、GitHub上への適用は未実行。

接続復旧追記：利用者のアクセス対象保存後、2026-11-01にGitHubの作業ブランチ作成が成功した。前述の403は復旧前の記録。管理6ファイルのみを追加し既存13ファイルを保持する。
