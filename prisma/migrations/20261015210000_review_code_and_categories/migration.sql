-- AlterTable
ALTER TABLE "Article" ADD COLUMN "reviewCode" TEXT;

-- Reference data: the nine editorial sections (idempotent). Not content.
INSERT INTO "Category" ("id","slug","name","description","sortOrder","autoPublish","sensitive") VALUES
 ('cat_world','world','World','International news, diplomacy and global events.',10,true,true),
 ('cat_politics','politics','Politics','Government, elections and public policy.',20,true,true),
 ('cat_business','business','Business','Companies, markets and industry.',30,true,false),
 ('cat_technology','technology','Technology','Software, hardware, internet and digital policy.',40,true,false),
 ('cat_economy','economy','Economy','Macroeconomics, inflation, jobs, trade and central banks.',50,true,false),
 ('cat_entertainment','entertainment','Entertainment','Film, television, music and culture.',60,true,false),
 ('cat_sports','sports','Sports','Results, transfers and competitions.',70,true,false),
 ('cat_science','science','Science','Research, space and the environment.',80,true,false),
 ('cat_health','health','Health','Medicine, public health and wellbeing.',90,true,true)
ON CONFLICT ("slug") DO NOTHING;
