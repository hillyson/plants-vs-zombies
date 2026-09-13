# 素材来源

此项目为非官方 Plants vs. Zombies 网页同人游戏，独立实现游戏逻辑。

本地 `assets/` 的庭院背景、植物和僵尸 GIF、阳光、铲子、割草机及音频取自：
https://github.com/jiangnangame/New-Plants-vs-Zombies-JavaScript

源目录为 `images/Plants`、`images/Zombies`、`images/interface` 与 `audio`。`SunFlower-single.gif` 对应 `images/Plants/SunFlower/SunFlower1.gif`，`mower.png` 对应 `images/interface/LawnCleaner.png`，其他重命名文件保持角色或效果名。获取日期：2026-09-13。

原作名称、角色、画面和音频的权利归 PopCap / Electronic Arts 及相关权利人所有。上游仓库的公开可访问性不表示这些原作素材获得了商业再许可。本项目不声称拥有原作素材版权，也不附加覆盖这些素材的开源许可证。

## 神水滴射手

`assets/DivineWaterShooter.png` 为本项目使用 imagegen 新生成的透明背景角色图，并非提取的同人原版素材。新增角色玩法参考同名同人植物的公开描述，网页实现为同一行高伤害穿透：
https://www.233leyuan.com/post-detail/2062025188046450688

## 僵王挑战

`Zomboss.gif`、`Zomboss-idle.gif`、`Zomboss-attack.gif` 分别对应上游 `images/Zombies/LGBOSS/0.gif`、`1.gif`、`2.gif`，为机甲僵王素材。召唤、落点预警、砸击、暴走及血条由本项目实现。

## 西瓜投手

`assets/MelonPult.png` 使用内置 imagegen 新生成的透明背景立绘，并非原版提取素材；西瓜弹丸、碎片和抛投动画由 CSS 与独立游戏逻辑实现。

生成提示：Create a single transparent-background game sprite asset for a web Plants vs Zombies fan game: the classic recognizable Melon-pult / 西瓜投手, facing RIGHT, full body isolated, no scenery, no text, no frame, no ground rectangle. Compact chunky rounded green watermelon plant body with dark wavy melon stripes, two alert cartoon eyes looking right, leafy base, curved springy green catapult stalk rising behind its body with a cupped leaf holding a separate striped whole watermelon at the top ready to lob toward the right. Warm hand-painted 2D cartoon game art, thick dark olive outlines, simple cel-like shading, similar to original 2009 Plants vs Zombies sprites. Clear silhouette, exaggerated charming proportions, designed to remain readable when displayed at 75 pixels tall. Body and throwing arm together centered and filling about 90% of a square canvas with small even transparent padding. True alpha transparency, no checkerboard baked into the image. One character only, no alternate views.
