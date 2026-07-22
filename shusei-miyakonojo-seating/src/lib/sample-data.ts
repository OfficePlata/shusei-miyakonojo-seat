import type { Attendee, AttendeeCategory } from "./types";
import { uid } from "./events";

export const INDUSTRIES = [
  "建設業",
  "不動産業",
  "飲食業",
  "製造業",
  "小売業",
  "保険業",
  "税理士・会計",
  "IT・情報通信",
  "美容・理容",
  "医療・福祉",
  "運送・物流",
  "金融業",
  "農業・畜産",
  "広告・印刷",
  "教育・スクール",
  "コンサルティング",
  "卸売業",
  "士業（法務）",
  "自動車関連",
  "サービス業",
];

interface Seed {
  name: string;
  kana: string;
  company: string;
  industry: string;
  category: AttendeeCategory;
  role?: string;
  referrer?: string;
  isFirstTime?: boolean;
}

const SEEDS: Seed[] = [
  { name: "田中 誠一", kana: "たなか せいいち", company: "田中建設株式会社", industry: "建設業", category: "vip", role: "代表世話人" },
  { name: "山口 由美", kana: "やまぐち ゆみ", company: "みやこ不動産", industry: "不動産業", category: "vip", role: "副代表世話人" },
  { name: "中村 隆", kana: "なかむら たかし", company: "中村工務店", industry: "建設業", category: "member", role: "世話人" },
  { name: "小林 香織", kana: "こばやし かおり", company: "サロン・ド・カオリ", industry: "美容・理容", category: "member" },
  { name: "佐藤 健太", kana: "さとう けんた", company: "佐藤精肉店", industry: "小売業", category: "member" },
  { name: "渡辺 三郎", kana: "わたなべ さぶろう", company: "渡辺運輸", industry: "運送・物流", category: "member", role: "会計" },
  { name: "伊藤 まり", kana: "いとう まり", company: "伊藤税理士事務所", industry: "税理士・会計", category: "member" },
  { name: "高橋 大輔", kana: "たかはし だいすけ", company: "TAKAHASHIシステムズ", industry: "IT・情報通信", category: "member" },
  { name: "松本 和彦", kana: "まつもと かずひこ", company: "松本製作所", industry: "製造業", category: "member" },
  { name: "井上 洋子", kana: "いのうえ ようこ", company: "いのうえ薬局", industry: "医療・福祉", category: "member" },
  { name: "木村 拓也", kana: "きむら たくや", company: "木村自動車販売", industry: "自動車関連", category: "member" },
  { name: "林 真理子", kana: "はやし まりこ", company: "はやし珈琲店", industry: "飲食業", category: "member" },
  { name: "清水 淳", kana: "しみず じゅん", company: "清水保険サービス", industry: "保険業", category: "member" },
  { name: "山田 英樹", kana: "やまだ ひでき", company: "山田印刷", industry: "広告・印刷", category: "member" },
  { name: "森 沙織", kana: "もり さおり", company: "MORIデザイン", industry: "広告・印刷", category: "member" },
  { name: "池田 剛", kana: "いけだ つよし", company: "池田農園", industry: "農業・畜産", category: "member" },
  { name: "橋本 直美", kana: "はしもと なおみ", company: "はしもと学習塾", industry: "教育・スクール", category: "member" },
  { name: "阿部 慎二", kana: "あべ しんじ", company: "阿部コンサルティング", industry: "コンサルティング", category: "member" },
  { name: "石川 亮", kana: "いしかわ りょう", company: "石川電機", industry: "製造業", category: "member" },
  { name: "前田 久美子", kana: "まえだ くみこ", company: "前田司法書士事務所", industry: "士業（法務）", category: "member" },
  { name: "藤田 修", kana: "ふじた おさむ", company: "藤田商事", industry: "卸売業", category: "member" },
  { name: "岡田 幸子", kana: "おかだ さちこ", company: "おかだ介護サービス", industry: "医療・福祉", category: "member" },
  { name: "後藤 健", kana: "ごとう けん", company: "後藤建材", industry: "建設業", category: "member" },
  { name: "村上 春樹", kana: "むらかみ はるき", company: "村上不動産管理", industry: "不動産業", category: "member" },
  { name: "近藤 裕", kana: "こんどう ゆたか", company: "近藤鉄工", industry: "製造業", category: "member" },
  { name: "遠藤 恵", kana: "えんどう めぐみ", company: "エンドウフラワー", industry: "小売業", category: "member" },
  { name: "青木 誠", kana: "あおき まこと", company: "青木物流センター", industry: "運送・物流", category: "member" },
  { name: "坂本 龍一", kana: "さかもと りゅういち", company: "坂本音楽教室", industry: "教育・スクール", category: "member" },
  { name: "福田 智子", kana: "ふくだ ともこ", company: "福田エステ", industry: "美容・理容", category: "member" },
  { name: "太田 学", kana: "おおた まなぶ", company: "太田会計事務所", industry: "税理士・会計", category: "member" },
  { name: "西村 大介", kana: "にしむら だいすけ", company: "西村ソフトウェア", industry: "IT・情報通信", category: "member" },
  { name: "藤井 由紀", kana: "ふじい ゆき", company: "藤井生命", industry: "保険業", category: "member" },
  { name: "岡本 隆志", kana: "おかもと たかし", company: "岡本ハウジング", industry: "不動産業", category: "member" },
  { name: "三浦 直樹", kana: "みうら なおき", company: "三浦水産", industry: "卸売業", category: "member" },
  { name: "中島 涼子", kana: "なかじま りょうこ", company: "中島クリニック", industry: "医療・福祉", category: "member" },
  { name: "小川 賢治", kana: "おがわ けんじ", company: "小川塗装", industry: "建設業", category: "member" },
  // ゲスト
  { name: "鈴木 一馬", kana: "すずき かずま", company: "鈴木デザイン工房", industry: "広告・印刷", category: "guest", referrer: "森 沙織", isFirstTime: true },
  { name: "加藤 めぐみ", kana: "かとう めぐみ", company: "カトウ・キッチン", industry: "飲食業", category: "guest", referrer: "林 真理子", isFirstTime: true },
  { name: "吉田 浩二", kana: "よしだ こうじ", company: "吉田工業", industry: "製造業", category: "guest", referrer: "松本 和彦" },
  { name: "山本 明日香", kana: "やまもと あすか", company: "AsukaWEB", industry: "IT・情報通信", category: "guest", referrer: "高橋 大輔", isFirstTime: true },
  { name: "斎藤 徹", kana: "さいとう とおる", company: "斎藤運送", industry: "運送・物流", category: "guest", referrer: "渡辺 三郎" },
  { name: "石井 麻衣", kana: "いしい まい", company: "石井ネイル", industry: "美容・理容", category: "guest", referrer: "小林 香織", isFirstTime: true },
  { name: "橋口 誠", kana: "はしぐち まこと", company: "橋口不動産", industry: "不動産業", category: "guest", referrer: "山口 由美" },
  { name: "上田 直子", kana: "うえだ なおこ", company: "上田保険企画", industry: "保険業", category: "guest", referrer: "清水 淳", isFirstTime: true },
  { name: "原田 康", kana: "はらだ やすし", company: "原田電設", industry: "建設業", category: "guest", referrer: "中村 隆" },
  { name: "竹内 さやか", kana: "たけうち さやか", company: "竹内保育園", industry: "教育・スクール", category: "guest", referrer: "橋本 直美", isFirstTime: true },
  { name: "新井 亮太", kana: "あらい りょうた", company: "新井モータース", industry: "自動車関連", category: "guest", referrer: "木村 拓也" },
  { name: "菅原 里奈", kana: "すがわら りな", company: "菅原ベーカリー", industry: "飲食業", category: "guest", referrer: "佐藤 健太", isFirstTime: true },
  // 会員（追加）
  { name: "谷口 誠", kana: "たにぐち まこと", company: "谷口電気工事", industry: "建設業", category: "member" },
  { name: "上原 恵子", kana: "うえはら けいこ", company: "うえはら美容室", industry: "美容・理容", category: "member" },
  { name: "東 直樹", kana: "あずま なおき", company: "東不動産", industry: "不動産業", category: "member" },
  { name: "大塚 浩", kana: "おおつか ひろし", company: "大塚精密", industry: "製造業", category: "member" },
  { name: "内田 さゆり", kana: "うちだ さゆり", company: "うちだ会計", industry: "税理士・会計", category: "member" },
  { name: "川口 稔", kana: "かわぐち みのる", company: "川口物産", industry: "卸売業", category: "member" },
  { name: "平田 洋一", kana: "ひらた よういち", company: "平田システム開発", industry: "IT・情報通信", category: "member" },
  { name: "星野 美咲", kana: "ほしの みさき", company: "ほしのカフェ", industry: "飲食業", category: "member" },
  { name: "和田 隆行", kana: "わだ たかゆき", company: "和田運送", industry: "運送・物流", category: "member" },
  { name: "大西 健", kana: "おおにし けん", company: "大西保険事務所", industry: "保険業", category: "member" },
  { name: "菊池 亜紀", kana: "きくち あき", company: "きくち歯科", industry: "医療・福祉", category: "member" },
  { name: "宮本 剛", kana: "みやもと つよし", company: "宮本農産", industry: "農業・畜産", category: "member" },
  { name: "服部 良太", kana: "はっとり りょうた", company: "服部印刷所", industry: "広告・印刷", category: "member" },
  { name: "桑原 直子", kana: "くわばら なおこ", company: "桑原学習館", industry: "教育・スクール", category: "member" },
  { name: "千葉 淳一", kana: "ちば じゅんいち", company: "千葉コンサル", industry: "コンサルティング", category: "member" },
  { name: "荒木 誠司", kana: "あらき せいじ", company: "荒木鋼業", industry: "製造業", category: "member" },
  { name: "白石 真央", kana: "しらいし まお", company: "白石フラワー", industry: "小売業", category: "member" },
  { name: "神田 康弘", kana: "かんだ やすひろ", company: "神田自動車整備", industry: "自動車関連", category: "member" },
  { name: "黒木 智子", kana: "くろぎ ともこ", company: "くろぎ司法書士事務所", industry: "士業（法務）", category: "member" },
  { name: "早川 学", kana: "はやかわ まなぶ", company: "早川建設", industry: "建設業", category: "member" },
  { name: "内藤 幸太", kana: "ないとう こうた", company: "内藤水産", industry: "卸売業", category: "member" },
  { name: "河野 里美", kana: "こうの さとみ", company: "こうのエステティック", industry: "美容・理容", category: "member" },
  // ゲスト（追加）
  { name: "濱田 剛", kana: "はまだ つよし", company: "濱田塗装", industry: "建設業", category: "guest", referrer: "小川 賢治" },
  { name: "有村 香", kana: "ありむら かおり", company: "ありむらパン工房", industry: "飲食業", category: "guest", referrer: "星野 美咲", isFirstTime: true },
  { name: "松尾 大樹", kana: "まつお だいき", company: "松尾ITソリューション", industry: "IT・情報通信", category: "guest", referrer: "平田 洋一", isFirstTime: true },
  { name: "川上 真一", kana: "かわかみ しんいち", company: "川上保険", industry: "保険業", category: "guest", referrer: "大西 健" },
  { name: "田村 美穂", kana: "たむら みほ", company: "たむらネイル", industry: "美容・理容", category: "guest", referrer: "上原 恵子", isFirstTime: true },
  { name: "中本 健二", kana: "なかもと けんじ", company: "中本製作所", industry: "製造業", category: "guest", referrer: "大塚 浩" },
  { name: "岩本 舞", kana: "いわもと まい", company: "いわもと保育園", industry: "教育・スクール", category: "guest", referrer: "桑原 直子", isFirstTime: true },
  { name: "江口 誠", kana: "えぐち まこと", company: "江口不動産", industry: "不動産業", category: "guest", referrer: "東 直樹" },
  // 事務局
  { name: "宮崎 里香", kana: "みやざき りか", company: "守成クラブ都城会場 事務局", industry: "サービス業", category: "staff", role: "事務局" },
  { name: "大山 健一", kana: "おおやま けんいち", company: "守成クラブ都城会場 事務局", industry: "サービス業", category: "staff", role: "事務局長" },
];

export function createSampleAttendees(): Attendee[] {
  return SEEDS.map((s) => ({
    id: uid("att"),
    name: s.name,
    kana: s.kana,
    company: s.company,
    industry: s.industry,
    category: s.category,
    role: s.role,
    referrer: s.referrer,
    isFirstTime: s.isFirstTime,
    keepWith: [],
    keepApart: [],
  }));
}
